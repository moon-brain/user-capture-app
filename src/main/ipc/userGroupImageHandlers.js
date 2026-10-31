// @ts-check
/**
 * User, Group, and Image-related IPC handlers
 */
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { formatTimestamp } = require('../utils/formatting');
const { getImageRepositoryPath } = require('../utils/config');
const { getActiveIngestPath, markWebcamCapture, getIncomingRotation } = require('../ingestFolder');
const { rotateImageFile } = require('../imageOrientation');
const { cropImageFile, restoreOriginal, hasOriginal, originalPathFor, displaySize } = require('../imageCrop');
const { readRepositoryFilenames, findUserRepositoryImage } = require('./exportHandlers');

/**
 * Register user, group, and image-related IPC handlers
 * @param {import('./context').IpcContext} context - Shared context, built in main.js
 */
function registerUserGroupImageHandlers(context) {
  const { mainWindow, logger, state, repositoryCacheManager, repositoryMirror, imageGridWindow, groupCoverageWindow } = context;

  /**
   * Lower-cased filenames in the repository. The mirror's index answers
   * without touching the synced drive, which the photos by group window asks
   * every time it comes to the front; until the index has loaded, the folder
   * itself is read, so a project opened a moment ago does not count zero.
   * @param {string} repositoryPath
   * @returns {Promise<Set<string>>}
   */
  const readRepositoryFileList = async (repositoryPath) => {
    const mirror = repositoryMirror ? repositoryMirror() : null;
    if (mirror && mirror.mirrorIndex && mirror.mirrorIndex.size > 0) {
      return new Set(mirror.getAllFiles());
    }
    return readRepositoryFilenames(repositoryPath, logger);
  };

  // The captured images grid lists who has which photo, and the photos by
  // group window counts them, and neither has any other way to learn that a
  // link changed: they only loaded on opening
  const notifyCapturedImagesChanged = () => {
    [imageGridWindow, groupCoverageWindow].forEach((getWindow) => {
      const win = getWindow ? getWindow() : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send('captured-images-changed');
      }
    });
  };

  // Get all users
  ipcMain.handle('get-users', async (event, filters, options = {}) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // Default options: load everything unless explicitly disabled
      const loadOptions = {
        loadRepositoryImages: options.loadRepositoryImages !== false
      };

      // Map frontend filters to database filters
      const dbFilters = {};
      if (filters.search) {
        dbFilters.search = filters.search;
      }
      if (filters.group) {
        dbFilters.groupCode = filters.group;
      }
      if (filters.type) {
        dbFilters.type = filters.type;
      }

      const users = await state.dbManager.getUsers(dbFilters);

      // Always resolved, whatever the Ver menu shows. The path is not only for
      // the thumbnail: exports, unlinking and duplicate detection read it, and
      // clearing it when captured photos were hidden made all of them believe
      // nobody had a photo. Hiding the thumbnails is the row renderer's job.
      const importsPath = path.join(state.projectPath, 'imports');
      users.forEach(user => {
        if (user.image_path && !path.isAbsolute(user.image_path)) {
          user.image_path = path.join(importsPath, user.image_path);
        }
      });

      // Only check repository images if needed (for photos or indicators)
      if (loadOptions.loadRepositoryImages) {
        const repositoryPath = await getImageRepositoryPath(state.dbManager);

        if (repositoryPath) {
          // Load repository file list ONCE asynchronously
          const repositoryFiles = await repositoryCacheManager.loadRepositoryFileList(repositoryMirror(), logger);

          // Now check each user against the Set (fast in-memory lookup)
          users.forEach(user => {
            // Check if image exists in repository
            user.has_repository_image = false;
            user.repository_image_path = null;

            // Determine the identifier (NIA for students, document for others)
            const identifier = user.type === 'student' ? user.nia : user.document;

            if (identifier) {
              // Check for .jpg and .jpeg extensions using in-memory Set
              const filename = repositoryCacheManager.findRepositoryFile(identifier, repositoryFiles);

              if (filename) {
                user.has_repository_image = true;
                // Use mirror path if mirror is available, fallback to repository path
                const mirror = repositoryMirror();
                const mirrorPath = mirror ? mirror.getMirrorPath(filename) : null;
                user.repository_image_path = mirrorPath || path.join(repositoryPath, filename);
              }
            }
          });
        } else {
          users.forEach(user => {
            user.has_repository_image = false;
            user.repository_image_path = null;
          });
        }
      } else {
        // Clear repository image data if not needed
        users.forEach(user => {
          user.has_repository_image = false;
          user.repository_image_path = null;
        });
      }

      return { success: true, users };
    } catch (error) {
      console.error('Error getting users:', error);
      return { success: false, error: error.message };
    }
  });

  // Get groups
  ipcMain.handle('get-groups', async () => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }
      const groups = await state.dbManager.getGroups();
      return { success: true, groups };
    } catch (error) {
      console.error('Error getting groups:', error);
      return { success: false, error: error.message };
    }
  });

  // Ver > Fotografías por grupo: users with a photo and without one in each
  // group, counting either the linked captured photos or the repository ones
  ipcMain.handle('get-group-photo-coverage', async (event, source = 'captured') => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      if (source !== 'repository') {
        const groups = await state.dbManager.getGroupPhotoCoverage();
        return { success: true, groups };
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado el depósito de imágenes. Configúralo en Proyecto > Configurar depósito de imágenes' };
      }
      if (!fs.existsSync(repositoryPath)) {
        return { success: false, error: `La carpeta del depósito no está disponible: ${repositoryPath}` };
      }

      const repositoryFiles = await readRepositoryFileList(repositoryPath);
      const groups = await state.dbManager.getGroupPhotoCoverage(
        (user) => findUserRepositoryImage(user, repositoryFiles) !== null
      );
      return { success: true, groups };
    } catch (error) {
      console.error('Error getting group photo coverage:', error);
      return { success: false, error: error.message };
    }
  });

  // Load repository images data in background (non-blocking)
  ipcMain.handle('load-repository-images', async (event, users) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      const repositoryData = {};

      if (!repositoryPath) {
        // No repository configured, return empty data
        return { success: true, repositoryData };
      }

      logger.info(`Loading repository images for ${users.length} users`);

      // Load repository file list ONCE
      const repositoryFiles = await repositoryCacheManager.loadRepositoryFileList(repositoryMirror(), logger);

      // Check each user against the repository
      users.forEach(user => {
        const identifier = user.type === 'student' ? user.nia : user.document;

        if (identifier) {
          const filename = repositoryCacheManager.findRepositoryFile(identifier, repositoryFiles);

          if (filename) {
            // Use mirror path if mirror is available, fallback to repository path
            const mirror = repositoryMirror();
            const mirrorPath = mirror ? mirror.getMirrorPath(filename) : null;
            repositoryData[user.id] = {
              has_repository_image: true,
              repository_image_path: mirrorPath || path.join(repositoryPath, filename)
            };
          } else {
            repositoryData[user.id] = {
              has_repository_image: false,
              repository_image_path: null
            };
          }
        } else {
          repositoryData[user.id] = {
            has_repository_image: false,
            repository_image_path: null
          };
        }
      });

      logger.info(`Repository images loaded: ${Object.keys(repositoryData).length} users processed`);
      return { success: true, repositoryData };
    } catch (error) {
      logger.error('Error loading repository images:', error);
      return { success: false, error: error.message };
    }
  });

  // Link image to user
  ipcMain.handle('link-image-user', async (event, data) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const { userId, imagePath } = data;

      // Convert absolute path to relative path for storage
      const importsPath = path.join(state.projectPath, 'imports');
      const relativeImagePath = path.isAbsolute(imagePath)
        ? path.basename(imagePath)
        : imagePath;

      // The photo the user already has, as a full path for display
      const user = await state.dbManager.getUserById(userId);
      const currentImage = user && user.image_path
        ? (path.isAbsolute(user.image_path) ? user.image_path : path.join(importsPath, user.image_path))
        : null;

      // Check if image is already assigned to other users
      const usersWithImage = await state.dbManager.getUsersByImagePath(relativeImagePath);
      if (usersWithImage.length > 0) {
        // Check if it's assigned to a different user
        const otherUsers = usersWithImage.filter(u => u.id !== userId);
        if (otherUsers.length > 0) {
          return {
            success: false,
            imageAlreadyAssigned: true,
            assignedUsers: otherUsers.map(u => ({
              id: u.id,
              name: `${u.first_name} ${u.last_name1} ${u.last_name2 || ''}`.trim(),
              nia: u.nia
            })),
            // Confirming also replaces the photo this user has, and the single
            // question asked has to say so: it used to be replaced silently
            currentImage: user && user.image_path && user.image_path !== relativeImagePath
              ? currentImage
              : null
          };
        }
      }

      // Check if user already has an image
      if (user && user.image_path) {
        return { success: false, needsConfirmation: true, currentImage };
      }

      const linkedAt = await state.dbManager.linkImageToUser(userId, relativeImagePath);
      notifyCapturedImagesChanged();
      return { success: true, linkedAt };
    } catch (error) {
      console.error('Error linking image:', error);
      return { success: false, error: error.message };
    }
  });

  // Confirm link (when user already has image)
  ipcMain.handle('confirm-link-image', async (event, data) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const { userId, imagePath } = data;

      // Convert absolute path to relative path for storage
      const relativeImagePath = path.isAbsolute(imagePath)
        ? path.basename(imagePath)
        : imagePath;

      const linkedAt = await state.dbManager.linkImageToUser(userId, relativeImagePath);
      notifyCapturedImagesChanged();
      return { success: true, linkedAt };
    } catch (error) {
      console.error('Error confirming link:', error);
      return { success: false, error: error.message };
    }
  });

  // Unlink image from user
  ipcMain.handle('unlink-image-user', async (event, userId) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      await state.dbManager.unlinkImageFromUser(userId);
      notifyCapturedImagesChanged();
      return { success: true };
    } catch (error) {
      console.error('Error unlinking image:', error);
      return { success: false, error: error.message };
    }
  });

  // Move image to ingest folder
  ipcMain.handle('move-image-to-ingest', async (event, sourceImagePath) => {
    try {
      if (!state.projectPath) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const ingestPath = getActiveIngestPath(state);
      const fileName = path.basename(sourceImagePath);
      let destPath = path.join(ingestPath, fileName);

      // Check if file already exists in ingest
      if (fs.existsSync(destPath)) {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const ext = path.extname(fileName);
        const name = path.basename(fileName, ext);
        destPath = path.join(ingestPath, `${name}_${timestamp}${ext}`);
      }

      // Copy file to ingest folder
      fs.copyFileSync(sourceImagePath, destPath);
      logger.info(`Image moved to ingest: ${fileName}`);

      return { success: true, filename: path.basename(destPath) };
    } catch (error) {
      console.error('Error moving image to ingest:', error);
      return { success: false, error: error.message };
    }
  });

  // Import images with ID
  ipcMain.handle('import-images-with-id', async (event, folderPath) => {
    try {
      if (!state.projectPath || !state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      logger.section('IMPORTING IMAGES WITH ID');
      logger.info(`Import folder: ${folderPath}`);

      const importsPath = path.join(state.projectPath, 'imports');

      // Get all JPG files from the selected folder
      const files = fs.readdirSync(folderPath).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ext === '.jpg' || ext === '.jpeg';
      });

      logger.info(`Found ${files.length} image files`);

      const results = {
        total: files.length,
        linked: 0,
        notFound: [],
        errors: []
      };

      // Process each image
      for (const file of files) {
        const fileName = path.basename(file, path.extname(file));
        const sourcePath = path.join(folderPath, file);

        try {
          // Get all users to search by NIA or document
          const allUsers = await state.dbManager.getUsers({});

          // Find user by NIA (students) or document (teachers/non-teaching staff)
          const user = allUsers.find(u => u.nia === fileName || u.document === fileName);

          if (user) {
            // Copy image to imports folder
            const destPath = path.join(importsPath, file);

            // If file exists, generate unique name
            let finalDestPath = destPath;
            if (fs.existsSync(destPath)) {
              const timestamp = Date.now();
              const ext = path.extname(file);
              const name = path.basename(file, ext);
              finalDestPath = path.join(importsPath, `${name}_${timestamp}${ext}`);
            }

            fs.copyFileSync(sourcePath, finalDestPath);

            // Link image to user
            const relativeImagePath = path.basename(finalDestPath);
            await state.dbManager.linkImageToUser(user.id, relativeImagePath);

            results.linked++;
            logger.info(`Linked ${file} to user ${user.first_name} ${user.last_name1} (ID: ${fileName})`);
          } else {
            results.notFound.push(fileName);
            logger.warning(`User not found for ID: ${fileName}`);
          }
        } catch (error) {
          results.errors.push({ file: fileName, error: error.message });
          logger.error(`Error processing ${file}`, error);
        }
      }

      logger.section('IMPORT COMPLETED');
      logger.success(`Linked: ${results.linked}/${results.total}`);
      if (results.notFound.length > 0) {
        logger.warning(`Not found: ${results.notFound.length} users`);
      }
      if (results.errors.length > 0) {
        logger.error(`Errors: ${results.errors.length} files`);
      }

      if (results.linked > 0) {
        notifyCapturedImagesChanged();
      }
      return { success: true, results };
    } catch (error) {
      logger.error('Error importing images with ID', error);
      return { success: false, error: error.message };
    }
  });

  // Get images
  ipcMain.handle('get-images', async () => {
    try {
      if (!state.imageManager) {
        throw new Error('No hay ningún proyecto abierto');
      }
      const images = await state.imageManager.getImages();
      return { success: true, images };
    } catch (error) {
      console.error('Error getting images:', error);
      return { success: false, error: error.message };
    }
  });

  // The automatic rotation of the project, for the notice over the viewer
  ipcMain.handle('get-incoming-rotation', async () => ({
    degrees: state.dbManager ? (state.incomingRotation ?? await getIncomingRotation(state.dbManager)) : 0
  }));

  /**
   * The absolute path of a captured photo: one directly in the project's
   * imports folder, which are the captured ones. Not in a subfolder, so the
   * originals kept by a crop are never turned or cropped themselves.
   * @param {string} imagePath
   * @param {string} action - what is refused, for the message ("girar")
   * @returns {string}
   */
  const resolveCapturedImage = (imagePath, action) => {
    if (!state.projectPath) {
      throw new Error('No hay ningún proyecto abierto');
    }
    const importsPath = path.join(state.projectPath, 'imports');
    const resolved = path.resolve(importsPath, String(imagePath || ''));
    if (path.dirname(resolved).toLowerCase() !== path.resolve(importsPath).toLowerCase()) {
      throw new Error(`Solo se pueden ${action} las fotos capturadas del proyecto`);
    }
    if (!fs.existsSync(resolved)) {
      throw new Error('La foto ya no está en la carpeta imports');
    }
    return resolved;
  };

  // Every view of the photo has to load it again: the name is the same
  const notifyCapturedImageRewritten = (imagePath, details = {}) => {
    const windows = [mainWindow ? mainWindow() : null, imageGridWindow ? imageGridWindow() : null];
    windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('captured-image-rewritten', { imagePath, ...details });
      }
    });
  };

  // Turn a captured photo a quarter turn, by its EXIF orientation
  ipcMain.handle('rotate-captured-image', async (event, imagePath, degrees) => {
    try {
      if (!state.projectPath) {
        throw new Error('No hay ningún proyecto abierto');
      }
      if (![90, -90, 180].includes(degrees)) {
        throw new Error(`Giro no válido: ${degrees}`);
      }
      const resolved = resolveCapturedImage(imagePath, 'girar');

      const orientation = await rotateImageFile(resolved, degrees);
      // A crop starts from the original: it turns with the photo, or the next
      // crop would undo the turn
      if (hasOriginal(resolved)) {
        await rotateImageFile(originalPathFor(resolved), degrees);
      }
      logger.info(`Captured image turned ${degrees}°: ${path.basename(resolved)} (EXIF orientation ${orientation})`);

      notifyCapturedImageRewritten(resolved, { orientation });
      return { success: true, orientation };
    } catch (error) {
      logger.error('Error rotating captured image:', error);
      return { success: false, error: error.message };
    }
  });

  // What the crop dialog starts from: the original if the photo was cropped
  // before, the photo itself if not
  ipcMain.handle('get-captured-image-crop-source', async (event, imagePath) => {
    try {
      const resolved = resolveCapturedImage(imagePath, 'recortar');
      const cropped = hasOriginal(resolved);
      const sourcePath = cropped ? originalPathFor(resolved) : resolved;
      // As shown, after the EXIF orientation: the rectangle is measured on it
      const { width, height } = await displaySize(sourcePath);
      return { success: true, sourcePath, hasOriginal: cropped, width, height };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Crop a captured photo in place; the original is kept to start again
  ipcMain.handle('crop-captured-image', async (event, imagePath, rect) => {
    try {
      const resolved = resolveCapturedImage(imagePath, 'recortar');
      const size = await cropImageFile(resolved, rect);
      logger.info(`Captured image cropped to ${size.width}x${size.height}: ${path.basename(resolved)}`);

      notifyCapturedImageRewritten(resolved);
      return { success: true, ...size };
    } catch (error) {
      logger.error('Error cropping captured image:', error);
      return { success: false, error: error.message };
    }
  });

  // Undo every crop of a captured photo
  ipcMain.handle('restore-captured-image', async (event, imagePath) => {
    try {
      const resolved = resolveCapturedImage(imagePath, 'restaurar');
      await restoreOriginal(resolved);
      logger.info(`Captured image restored to its original: ${path.basename(resolved)}`);

      notifyCapturedImageRewritten(resolved);
      return { success: true };
    } catch (error) {
      logger.error('Error restoring captured image:', error);
      return { success: false, error: error.message };
    }
  });

  // Save captured image
  ipcMain.handle('save-captured-image', async (event, imageData) => {
    try {
      if (!state.projectPath) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const ingestPath = getActiveIngestPath(state);
      const timestamp = new Date();
      let filename = formatTimestamp(timestamp) + '.jpg';
      let filePath = path.join(ingestPath, filename);

      // Check for duplicate filenames (same second)
      let counter = 1;
      while (fs.existsSync(filePath)) {
        filename = formatTimestamp(timestamp) + '_' + counter + '.jpg';
        filePath = path.join(ingestPath, filename);
        counter++;
      }

      // Convert base64 to buffer and save
      const base64Data = imageData.replace(/^data:image\/jpeg;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      // Already turned with the camera window's button: the project's
      // automatic rotation must not turn it again
      markWebcamCapture(state, filePath);
      fs.writeFileSync(filePath, buffer);

      return { success: true, filename };
    } catch (error) {
      console.error('Error saving captured image:', error);
      return { success: false, error: error.message };
    }
  });

  // Mark orla as paid
  ipcMain.handle('mark-orla-paid', async (event, userId, isPaid) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      await state.dbManager.markOrlaPaid(userId, isPaid);
      return { success: true };
    } catch (error) {
      console.error('Error marking orla as paid:', error);
      return { success: false, error: error.message };
    }
  });

  // Get orla paid status
  ipcMain.handle('get-orla-paid-status', async (event, userId) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const isPaid = await state.dbManager.getOrlaPaidStatus(userId);
      return { success: true, isPaid };
    } catch (error) {
      console.error('Error getting orla paid status:', error);
      return { success: false, error: error.message };
    }
  });

  // Mark receipt as printed
  ipcMain.handle('mark-receipt-printed', async (event, userId, isPrinted) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      await state.dbManager.markReceiptPrinted(userId, isPrinted);
      return { success: true };
    } catch (error) {
      console.error('Error marking receipt as printed:', error);
      return { success: false, error: error.message };
    }
  });

  // Get receipt printed status
  ipcMain.handle('get-receipt-printed-status', async (event, userId) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const isPrinted = await state.dbManager.getReceiptPrintedStatus(userId);
      return { success: true, isPrinted };
    } catch (error) {
      console.error('Error getting receipt printed status:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerUserGroupImageHandlers };
