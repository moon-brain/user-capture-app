// @ts-check
/**
 * Miscellaneous IPC handlers (dialog, camera, config, UI state, tags)
 */
const { ipcMain, dialog } = require('electron');
const path = require('path');
const { getActiveIngestPath, getConfiguredIngestPath } = require('../ingestFolder');
const { getLastExportFolder, setLastExportFolder, getUpdatePreferences, saveUpdatePreferences, isOrlaServiceEnabled, normalizeExportDefaults, getExportDefaults } = require('../utils/config');
const { publishProjectXml, getAppliedXml, parsePublishedName } = require('../sharedXml');
const { getImageRepositoryPath, setImageRepositoryPath, getSelectedGroupFilter, setSelectedGroupFilter, loadGlobalConfig, saveGlobalConfig } = require('../utils/config');
const VersionManager = require('../utils/version');
const { listRequestFolder, projectRequests, reviewRequests, archiveRequests, stampRequest } = require('../pendingRequests');

// Card print requests cache, remembered per repository: opening another project
// points at a different folder, and its requests must not be reported against
// this project's users
let cardPrintRequestsCache = null;
let cardPrintRequestsCacheTime = null;
let cardPrintRequestsCacheKey = null;
const CARD_PRINT_CACHE_TTL = 30000; // 30 seconds

/**
 * Whether a cached folder listing can still be used
 * @param {Array|null} cache
 * @param {number|null} cachedAt
 * @param {string|null} cachedKey - Repository the listing was taken from
 * @param {string|null} repositoryPath - Repository being asked about now
 * @param {number} ttl
 * @returns {boolean}
 */
function isListingCacheValid(cache, cachedAt, cachedKey, repositoryPath, ttl) {
  return Boolean(cache) &&
    cachedKey === repositoryPath &&
    Boolean(cachedAt) &&
    (Date.now() - cachedAt) < ttl;
}

/**
 * Receipt price to use: 0 is a valid price, only a missing or unusable value
 * falls back to 18 (it used to be `price || 18`, which turned 0 into 18)
 * @param {*} value
 * @returns {number}
 */
function receiptPriceOrDefault(value) {
  const price = typeof value === 'string' ? parseFloat(value) : value;
  return typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : 18;
}

/**
 * Register miscellaneous IPC handlers
 * @param {import('./context').IpcContext} context - Shared context, built in main.js
 */
function registerMiscHandlers(context) {
  const { mainWindow: getMainWindow, logger, state, imageGridWindow, groupCoverageWindow, repositoryGridWindow, createMenu, reinitializeRepositoryMirror, repositoryMirror: getRepositoryMirror, thumbnailService } = context;

  // ============================================================================
  // Dialog Handlers
  // ============================================================================

  // Show open dialog
  ipcMain.handle('show-open-dialog', async (event, options) => {
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  });

  // Choose the folder an export goes to. Every export uses this one, so the
  // dialog opens where the previous export went, whichever export it was.
  ipcMain.handle('select-export-folder', async (event, options = {}) => {
    const properties = new Set(options.properties || []);
    properties.add('openDirectory');
    properties.add('createDirectory');

    const result = await dialog.showOpenDialog(getMainWindow(), {
      ...options,
      defaultPath: options.defaultPath || getLastExportFolder() || undefined,
      properties: [...properties]
    });

    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      setLastExportFolder(result.filePaths[0]);
    }

    return result;
  });

  // ============================================================================
  // Window Handlers
  // ============================================================================

  // Focus window handler
  ipcMain.handle('focus-window', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.focus();
    }
    return { success: true };
  });

  // ============================================================================
  // Camera Handlers
  // ============================================================================

  // Update available cameras
  ipcMain.handle('update-available-cameras', async (event, cameras) => {
    state.availableCameras = cameras;
    // If no camera is selected yet, select the first one
    if (!state.selectedCameraId && cameras.length > 0) {
      state.selectedCameraId = cameras[0].deviceId;
    }
    createMenu();
    return { success: true, selectedCameraId: state.selectedCameraId };
  });

  // Get selected camera
  ipcMain.handle('get-selected-camera', async () => {
    return { success: true, selectedCameraId: state.selectedCameraId };
  });

  // ============================================================================
  // Repository Configuration Handlers
  // ============================================================================

  // Get image repository path
  ipcMain.handle('get-image-repository-path', async () => {
    try {
      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }
      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      return { success: true, path: repositoryPath };
    } catch (error) {
      console.error('Error getting image repository path:', error);
      return { success: false, error: error.message };
    }
  });

  // Set image repository path
  ipcMain.handle('set-image-repository-path', async (event, repositoryPath) => {
    try {
      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }
      if (await setImageRepositoryPath(state.dbManager, repositoryPath)) {
        // Reinitialize repository mirror with new path
        logger.info(`Repository path changed to: ${repositoryPath}`);
        await reinitializeRepositoryMirror();
        logger.success('Repository mirror reinitialized with new path');

        // A new project gets its repository after it is created, so this is
        // when its XML can be shared; also when moving to another repository
        const sharedXml = await publishProjectXml(state.dbManager, repositoryPath);
        logger.info(`School XML on repository change: ${sharedXml.status}`, sharedXml.fileName || sharedXml.error || null);

        return { success: true, sharedXml };
      } else {
        return { success: false, error: 'No se pudo guardar la configuración' };
      }
    } catch (error) {
      console.error('Error setting image repository path:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // UI State Handlers (Group Filter Synchronization)
  // ============================================================================

  // Get selected group filter
  ipcMain.handle('get-selected-group-filter', async () => {
    try {
      const groupFilter = getSelectedGroupFilter();
      return { success: true, groupCode: groupFilter };
    } catch (error) {
      console.error('Error getting selected group filter:', error);
      return { success: false, error: error.message };
    }
  });

  // Set selected group filter
  ipcMain.handle('set-selected-group-filter', async (event, groupCode) => {
    try {
      if (setSelectedGroupFilter(groupCode)) {
        // Notify all windows about the filter change
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('group-filter-changed', groupCode);
        }
        if (imageGridWindow && imageGridWindow()) {
          imageGridWindow().webContents.send('group-filter-changed', groupCode);
        }
        if (repositoryGridWindow && repositoryGridWindow()) {
          repositoryGridWindow().webContents.send('group-filter-changed', groupCode);
        }
        return { success: true };
      } else {
        return { success: false, error: 'No se pudo guardar el filtro' };
      }
    } catch (error) {
      console.error('Error setting selected group filter:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Image Tag Handlers
  // ============================================================================

  // Add image tag
  ipcMain.handle('add-image-tag', async (event, data) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const { imagePath, tag } = data;

      // Convert absolute path to relative path for storage
      const relativeImagePath = path.isAbsolute(imagePath)
        ? path.basename(imagePath)
        : imagePath;

      await state.dbManager.addImageTag(relativeImagePath, tag);
      logger.info(`Tag added to image: ${relativeImagePath} - "${tag}"`);

      return { success: true };
    } catch (error) {
      console.error('Error adding image tag:', error);
      return { success: false, error: error.message };
    }
  });

  // Get image tags
  ipcMain.handle('get-image-tags', async (event, imagePath) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // Convert absolute path to relative path for storage
      const relativeImagePath = path.isAbsolute(imagePath)
        ? path.basename(imagePath)
        : imagePath;

      const tags = await state.dbManager.getImageTags(relativeImagePath);
      return { success: true, tags };
    } catch (error) {
      console.error('Error getting image tags:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete image tag
  ipcMain.handle('delete-image-tag', async (event, tagId) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      await state.dbManager.deleteImageTag(tagId);
      logger.info(`Tag deleted: ${tagId}`);

      return { success: true };
    } catch (error) {
      console.error('Error deleting image tag:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all images with tags
  ipcMain.handle('get-all-images-with-tags', async () => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const imagesWithTags = await state.dbManager.getAllImagesWithTags();

      // Convert relative paths to absolute paths and get tags for each image
      const importsPath = path.join(state.projectPath, 'imports');
      const imagesData = await Promise.all(
        imagesWithTags.map(async (row) => {
          const absolutePath = path.isAbsolute(row.image_path)
            ? row.image_path
            : path.join(importsPath, row.image_path);

          const tags = await state.dbManager.getImageTags(row.image_path);

          return {
            path: absolutePath,
            relativePath: row.image_path,
            tags: tags
          };
        })
      );

      return { success: true, images: imagesData };
    } catch (error) {
      console.error('Error getting images with tags:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Repository Mirror Handlers
  // ============================================================================

  // Get repository sync status
  ipcMain.handle('get-sync-status', async () => {
    try {
      const { repositoryMirror } = context;
      const mirror = repositoryMirror();

      if (!mirror) {
        return { success: true, isSyncing: false, hasCompleted: false };
      }

      const stats = mirror.getStats();

      return {
        success: true,
        isSyncing: stats.isSyncing,
        hasCompleted: stats.lastSyncTime !== null,
        totalFiles: stats.totalFiles,
        lastSyncTime: stats.lastSyncTime
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return { success: false, error: error.message, isSyncing: false };
    }
  });

  // ============================================================================
  // Project Info Handlers
  // ============================================================================

  // Get project information (path and repository path)
  ipcMain.handle('get-project-info', async () => {
    try {
      if (!state.projectPath) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);

      return {
        success: true,
        projectPath: state.projectPath,
        repositoryPath: repositoryPath || null
      };
    } catch (error) {
      console.error('Error getting project info:', error);
      return { success: false, error: error.message };
    }
  });

  // Update window title
  /**
   * What the thumbnail cache holds, for Preferencias. It is swept on its own
   * to stay under a ceiling; this is for emptying it by hand, which is what to
   * do if a thumbnail ever looks wrong.
   */
  ipcMain.handle('measure-thumbnail-cache', async () => {
    try {
      const service = thumbnailService && thumbnailService();

      if (!service) {
        return { success: false, error: 'La caché de miniaturas no está disponible.' };
      }

      return { success: true, ...(await service.measureCache()) };
    } catch (error) {
      logger.error('Error measuring the thumbnail cache', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clear-thumbnail-cache', async () => {
    try {
      const service = thumbnailService && thumbnailService();

      if (!service) {
        return { success: false, error: 'La caché de miniaturas no está disponible.' };
      }

      const held = await service.measureCache();
      await service.clearCache();

      return { success: true, ...held };
    } catch (error) {
      logger.error('Error clearing the thumbnail cache', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('update-window-title', async () => {
    try {
      const { updateWindowTitle } = context;
      if (updateWindowTitle) {
        updateWindowTitle();
      }
      return { success: true };
    } catch (error) {
      console.error('Error updating window title:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Card Print Request Handlers
  // ============================================================================

  // Get pending card print requests
  ipcMain.handle('get-card-print-requests', async () => {
    try {
      const { projectPath, dbManager } = state;

      if (!projectPath || !dbManager) {
        return { success: false, error: 'No hay proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(dbManager);

      if (isListingCacheValid(cardPrintRequestsCache, cardPrintRequestsCacheTime, cardPrintRequestsCacheKey, repositoryPath, CARD_PRINT_CACHE_TTL)) {
        logger.info('[CardPrint] Using cached card print requests');
      } else {
        cardPrintRequestsCache = repositoryPath
          ? await listRequestFolder(path.join(repositoryPath, 'To-Print-ID'))
          : [];
        cardPrintRequestsCacheTime = Date.now();
        cardPrintRequestsCacheKey = repositoryPath;
        logger.info(`[CardPrint] Scanned ${cardPrintRequestsCache.length} card print requests (cached for ${CARD_PRINT_CACHE_TTL}ms)`);
      }

      return { success: true, ...(await projectRequests(dbManager, cardPrintRequestsCache)) };
    } catch (error) {
      logger.error('Error getting card print requests:', error);
      return { success: false, error: error.message };
    }
  });

  // Request card print for selected users
  ipcMain.handle('request-card-print', async (event, userIds) => {
    try {
      const fs = require('fs').promises;
      const { projectPath, dbManager } = state;

      if (!projectPath || !dbManager) {
        return { success: false, error: 'No hay proyecto abierto' };
      }

      if (!userIds || userIds.length === 0) {
        return { success: false, error: 'No hay usuarios seleccionados' };
      }

      // Get image repository path
      const repositoryPath = await getImageRepositoryPath(dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado la ruta del depósito de imágenes' };
      }

      // Create 'To-Print-ID' folder if it doesn't exist
      const toPrintIdFolder = path.join(repositoryPath, 'To-Print-ID');
      try {
        await fs.access(toPrintIdFolder);
      } catch {
        await fs.mkdir(toPrintIdFolder, { recursive: true });
        logger.info(`Created To-Print-ID folder: ${toPrintIdFolder}`);
      }

      // Get user data for selected users
      const users = await dbManager.getUsersByIds(userIds);

      if (!users || users.length === 0) {
        return { success: false, error: 'No se encontraron usuarios' };
      }

      // Generate ID files for each user
      let count = 0;
      let skipped = 0;
      for (const user of users) {
        // Determine user ID (NIA for students, document for others)
        const userId = user.type === 'student' ? user.nia : user.document;

        if (!userId) {
          logger.warning(`User ${user.id} (${user.first_name} ${user.last_name1}) has no ID, skipping`);
          skipped++;
          continue;
        }

        // Check if user has repository image by verifying file existence
        const repositoryImagePath = path.join(repositoryPath, `${userId}.jpg`);
        try {
          await fs.access(repositoryImagePath);
        } catch {
          // File doesn't exist
          logger.warning(`User ${user.id} (${user.first_name} ${user.last_name1}) has no repository image (${userId}.jpg), skipping`);
          skipped++;
          continue;
        }

        // Create empty file with user ID as filename
        const filePath = path.join(toPrintIdFolder, userId);
        await fs.writeFile(filePath, '', 'utf8');
        await stampRequest(filePath, logger);
        count++;
        logger.info(`Created card print request for user ${user.id}: ${filePath}`);
      }

      // Invalidate cache after creating new requests
      cardPrintRequestsCache = null;
      cardPrintRequestsCacheTime = null;
      logger.info('[CardPrint] Cache invalidated after creating requests');

      return { success: true, count, skipped };
    } catch (error) {
      logger.error('Error requesting card print:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Publication Request Handlers
  // ============================================================================

  // Publication requests cache, remembered per repository for the same reason
  // as the card print one above
  let publicationRequestsCache = null;
  let publicationRequestsCacheTime = null;
  let publicationRequestsCacheKey = null;
  const PUBLICATION_CACHE_TTL = 30000; // 30 seconds

  // Get pending publication requests
  ipcMain.handle('get-publication-requests', async () => {
    try {
      const { projectPath, dbManager } = state;

      if (!projectPath || !dbManager) {
        return { success: false, error: 'No hay proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(dbManager);

      if (isListingCacheValid(publicationRequestsCache, publicationRequestsCacheTime, publicationRequestsCacheKey, repositoryPath, PUBLICATION_CACHE_TTL)) {
        logger.info('[Publication] Using cached publication requests');
      } else {
        publicationRequestsCache = repositoryPath
          ? await listRequestFolder(path.join(repositoryPath, 'To-Publish'), '.jpg')
          : [];
        publicationRequestsCacheTime = Date.now();
        publicationRequestsCacheKey = repositoryPath;
        logger.info(`[Publication] Scanned ${publicationRequestsCache.length} publication requests (cached for ${PUBLICATION_CACHE_TTL}ms)`);
      }

      return { success: true, ...(await projectRequests(dbManager, publicationRequestsCache)) };
    } catch (error) {
      logger.error('Error getting publication requests:', error);
      return { success: false, error: error.message };
    }
  });

  // Proyecto > Revisar solicitudes pendientes: the requests nobody in the
  // project will act on, and the project's own from before its course
  ipcMain.handle('review-pending-requests', async () => {
    try {
      const { projectPath, dbManager } = state;

      if (!projectPath || !dbManager) {
        return { success: false, error: 'No hay proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado la ruta del depósito de imágenes' };
      }

      return { success: true, ...(await reviewRequests(dbManager, repositoryPath)) };
    } catch (error) {
      logger.error('Error reviewing pending requests:', error);
      return { success: false, error: error.message };
    }
  });

  // Move the chosen requests into each folder's Archivadas subfolder
  ipcMain.handle('archive-pending-requests', async (event, selection = {}) => {
    try {
      const { projectPath, dbManager } = state;

      if (!projectPath || !dbManager) {
        return { success: false, error: 'No hay proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado la ruta del depósito de imágenes' };
      }

      const cards = await archiveRequests(repositoryPath, 'cards', selection.cards);
      const publications = await archiveRequests(repositoryPath, 'publications', selection.publications);

      cardPrintRequestsCache = null;
      cardPrintRequestsCacheTime = null;
      publicationRequestsCache = null;
      publicationRequestsCacheTime = null;

      logger.info(`[Requests] Archived ${cards.moved} card and ${publications.moved} publication requests`, {
        failed: [...cards.failed, ...publications.failed]
      });

      return { success: true, cards, publications };
    } catch (error) {
      logger.error('Error archiving pending requests:', error);
      return { success: false, error: error.message };
    }
  });

  // Request publication for selected users
  ipcMain.handle('request-publication', async (event, userIds) => {
    try {
      const fs = require('fs').promises;
      const { projectPath, dbManager } = state;

      if (!projectPath || !dbManager) {
        return { success: false, error: 'No hay proyecto abierto' };
      }

      if (!userIds || userIds.length === 0) {
        return { success: false, error: 'No hay usuarios seleccionados' };
      }

      // Get image repository path
      const repositoryPath = await getImageRepositoryPath(dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado la ruta del depósito de imágenes' };
      }

      // Create 'To-Publish' folder if it doesn't exist
      const toPublishFolder = path.join(repositoryPath, 'To-Publish');
      try {
        await fs.access(toPublishFolder);
      } catch {
        await fs.mkdir(toPublishFolder, { recursive: true });
        logger.info(`Created To-Publish folder: ${toPublishFolder}`);
      }

      // Get user data for selected users
      const users = await dbManager.getUsersByIds(userIds);

      if (!users || users.length === 0) {
        return { success: false, error: 'No se encontraron usuarios' };
      }

      // Copy repository images for each user
      let count = 0;
      let skipped = 0;
      for (const user of users) {
        // Determine user ID (NIA for students, document for others)
        const userId = user.type === 'student' ? user.nia : user.document;

        if (!userId) {
          logger.warning(`User ${user.id} (${user.first_name} ${user.last_name1}) has no ID, skipping`);
          skipped++;
          continue;
        }

        // Check if user has repository image by verifying file existence
        const repositoryImagePath = path.join(repositoryPath, `${userId}.jpg`);
        try {
          await fs.access(repositoryImagePath);
        } catch {
          // File doesn't exist
          logger.warning(`User ${user.id} (${user.first_name} ${user.last_name1}) has no repository image (${userId}.jpg), skipping`);
          skipped++;
          continue;
        }

        // Copy image to To-Publish folder with user ID as filename
        const destPath = path.join(toPublishFolder, `${userId}.jpg`);
        await fs.copyFile(repositoryImagePath, destPath);
        await stampRequest(destPath, logger);
        count++;
        logger.info(`Created publication request for user ${user.id}: ${destPath}`);
      }

      // Invalidate cache after creating new requests
      publicationRequestsCache = null;
      publicationRequestsCacheTime = null;
      logger.info('[Publication] Cache invalidated after creating requests');

      return { success: true, count, skipped };
    } catch (error) {
      logger.error('Error requesting publication:', error);
      return { success: false, error: error.message };
    }
  });

  // Check if users have card print requests (To-Print-ID)
  ipcMain.handle('check-card-print-requests', async (event, userIds) => {
    try {
      const fs = require('fs').promises;

      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);

      if (!repositoryPath) {
        return { success: true, usersWithRequests: [] };
      }

      const toPrintIdFolder = path.join(repositoryPath, 'To-Print-ID');

      // Check if To-Print-ID folder exists
      try {
        await fs.access(toPrintIdFolder);
      } catch {
        return { success: true, usersWithRequests: [] };
      }

      // Check which users have files in To-Print-ID
      const usersWithRequests = [];
      for (const userId of userIds) {
        const filePath = path.join(toPrintIdFolder, userId); // No extension
        try {
          await fs.access(filePath);
          usersWithRequests.push(userId);
        } catch {
          // File doesn't exist, skip
        }
      }

      logger.info(`[Card Print] Found ${usersWithRequests.length} pending requests`);
      return { success: true, usersWithRequests };
    } catch (error) {
      logger.error('Error checking card print requests:', error);
      return { success: false, error: error.message };
    }
  });

  // Move card print requests from To-Print-ID to Printed-ID
  ipcMain.handle('mark-cards-as-printed', async (event, userIds) => {
    try {
      const fs = require('fs').promises;

      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado la ruta del depósito de imágenes' };
      }

      const toPrintIdFolder = path.join(repositoryPath, 'To-Print-ID');
      const printedIdFolder = path.join(repositoryPath, 'Printed-ID');

      // Create Printed-ID folder if it doesn't exist
      try {
        await fs.access(printedIdFolder);
      } catch {
        await fs.mkdir(printedIdFolder, { recursive: true });
        logger.info(`Created Printed-ID folder: ${printedIdFolder}`);
      }

      // Move files from To-Print-ID to Printed-ID
      let movedCount = 0;
      for (const userId of userIds) {
        const sourcePath = path.join(toPrintIdFolder, userId); // No extension
        const destPath = path.join(printedIdFolder, userId); // No extension

        try {
          await fs.access(sourcePath);
          await fs.rename(sourcePath, destPath);
          movedCount++;
          logger.info(`Moved card print request from To-Print-ID to Printed-ID: ${userId}`);

          // The printed cards window dates each card by this file's
          // modification time, which a move keeps from the request
          try {
            const now = new Date();
            await fs.utimes(destPath, now, now);
          } catch (error) {
            logger.warning(`Could not date the printed card for user ${userId}: ${error.message}`);
          }
        } catch (error) {
          // File doesn't exist or couldn't be moved, skip
          logger.warning(`Could not move card print request for user ${userId}: ${error.message}`);
        }
      }

      // Invalidate cache after moving files
      cardPrintRequestsCache = null;
      cardPrintRequestsCacheTime = null;
      logger.info('[Card Print] Cache invalidated after marking as printed');

      return { success: true, movedCount };
    } catch (error) {
      logger.error('Error marking cards as printed:', error);
      return { success: false, error: error.message };
    }
  });

  // Get list of printed cards (users with files in Printed-ID folder)
  ipcMain.handle('get-printed-cards', async () => {
    try {
      const fs = require('fs').promises;

      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado la ruta del depósito de imágenes' };
      }

      const printedIdFolder = path.join(repositoryPath, 'Printed-ID');

      // Check if Printed-ID folder exists
      let files = [];
      try {
        await fs.access(printedIdFolder);
        files = await fs.readdir(printedIdFolder);
      } catch {
        // Folder doesn't exist, return empty list
        logger.info('[Card Print] Printed-ID folder does not exist');
        return { success: true, users: [] };
      }

      if (files.length === 0) {
        logger.info('[Card Print] No printed cards found');
        return { success: true, users: [] };
      }

      // Resolve every file name in one lookup instead of two queries each
      const matchedUsers = await state.dbManager.getUsersByIdentifiers(files);

      const usersByIdentifier = new Map();
      matchedUsers.forEach(user => {
        if (user.nia) usersByIdentifier.set(user.nia, user);
        if (user.document) usersByIdentifier.set(user.document, user);
      });

      // File modification time is when the card was moved to Printed-ID
      const printedDates = await Promise.all(
        files.map(async (fileId) => {
          try {
            const stats = await fs.stat(path.join(printedIdFolder, fileId));
            return stats.mtime.toISOString();
          } catch (error) {
            logger.warning(`[Card Print] Could not get file stats for ${fileId}: ${error.message}`);
            return null;
          }
        })
      );

      const users = [];
      files.forEach((fileId, index) => {
        const user = usersByIdentifier.get(fileId);

        if (!user) {
          logger.warning(`[Card Print] User not found for printed card ID: ${fileId}`);
          return;
        }

        user.printed_date = printedDates[index];
        users.push(user);
      });

      // Sort by printed date (newest first)
      users.sort((a, b) => {
        if (!a.printed_date) return 1;
        if (!b.printed_date) return -1;
        return new Date(b.printed_date).getTime() - new Date(a.printed_date).getTime();
      });

      logger.info(`[Card Print] Found ${users.length} printed cards`);
      return { success: true, users };
    } catch (error) {
      logger.error('Error getting printed cards:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear printed cards list (delete all files in Printed-ID folder)
  ipcMain.handle('clear-printed-cards', async () => {
    try {
      const fs = require('fs').promises;

      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado la ruta del depósito de imágenes' };
      }

      const printedIdFolder = path.join(repositoryPath, 'Printed-ID');

      // Check if Printed-ID folder exists
      try {
        await fs.access(printedIdFolder);
      } catch {
        // Folder doesn't exist, nothing to clear
        logger.info('[Card Print] Printed-ID folder does not exist, nothing to clear');
        return { success: true, deletedCount: 0 };
      }

      // Read all files in the folder
      const files = await fs.readdir(printedIdFolder);

      if (files.length === 0) {
        logger.info('[Card Print] Printed-ID folder is already empty');
        return { success: true, deletedCount: 0 };
      }

      // Delete all files
      let deletedCount = 0;
      for (const file of files) {
        try {
          const filePath = path.join(printedIdFolder, file);
          await fs.unlink(filePath);
          deletedCount++;
        } catch (error) {
          logger.warning(`[Card Print] Could not delete file ${file}: ${error.message}`);
        }
      }

      logger.info(`[Card Print] Cleared ${deletedCount} files from Printed-ID folder`);
      return { success: true, deletedCount };
    } catch (error) {
      logger.error('Error clearing printed cards:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Version Handler
  // ============================================================================

  // Get application version
  ipcMain.handle('get-app-version', async () => {
    try {
      return VersionManager.getVersion();
    } catch (error) {
      logger.error('Error getting app version:', error);
      return '0.0.0';
    }
  });

  // ============================================================================
  // Printer Configuration Handler
  // ============================================================================

  // Get list of available printers
  ipcMain.handle('get-printers', async () => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        logger.error('[Printer] Main window not available');
        return [];
      }

      // Use getPrintersAsync() instead of deprecated getPrinters()
      let printers = await mainWindow.webContents.getPrintersAsync();
      logger.info(`[Printer] webContents.getPrintersAsync() returned ${printers.length} printers`);

      if (printers.length === 0) {
        logger.warn('[Printer] No printers found via webContents.getPrintersAsync()');
      } else {
        // Chromium dropped status and isDefault from PrinterInfo (Electron 36)
        logger.info(`[Printer] Available printers:`, printers.map(p => ({
          name: p.name,
          displayName: p.displayName
        })));
      }

      return printers;
    } catch (error) {
      logger.error('[Printer] Error getting printers:', error);
      return [];
    }
  });

  // Save printer configuration
  ipcMain.handle('save-printer-config', async (event, printerConfig) => {
    try {
      const { loadGlobalConfig, saveGlobalConfig } = require('../utils/config');
      const config = loadGlobalConfig();
      config.printer = printerConfig;
      saveGlobalConfig(config);
      logger.info('[Printer] Configuration saved:', printerConfig);
      return { success: true };
    } catch (error) {
      logger.error('Error saving printer config:', error);
      return { success: false, error: error.message };
    }
  });

  // Open printer preferences
  ipcMain.handle('open-printer-preferences', async (event, printerName) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execPromise = promisify(exec);

      logger.info(`[Printer] Opening preferences for: ${printerName}`);

      // Windows command to open printer properties
      // rundll32 printui.dll,PrintUIEntry /e /n "PrinterName"
      const command = `rundll32 printui.dll,PrintUIEntry /e /n "${printerName}"`;

      await execPromise(command);
      logger.info('[Printer] Preferences dialog opened successfully');
      return { success: true };
    } catch (error) {
      logger.error('[Printer] Error opening printer preferences:', error);
      return { success: false, error: error.message };
    }
  });

  // Get saved printer configuration
  ipcMain.handle('get-printer-config', async () => {
    try {
      const { loadGlobalConfig } = require('../utils/config');
      const config = loadGlobalConfig();
      return config.printer || null;
    } catch (error) {
      logger.error('Error getting printer config:', error);
      return null;
    }
  });

  // ============================================================================
  // Receipt Configuration Handler
  // ============================================================================

  // Get receipt configuration
  ipcMain.handle('get-receipt-config', async () => {
    try {
      const { loadGlobalConfig } = require('../utils/config');
      const config = loadGlobalConfig();

      // Default configuration
      const defaultConfig = {
        subtitle: 'Reserva de una copia de Orla',
        price: 18,
        footerText: 'Este resguardo es personal e intransferible.\nPor favor, si no eres el/la titular que aparece en él, entrégalo en la dirección del centro para que se lo hagan llegar a su propietario/a.\nEs imprescindible presentar este resguardo para recoger la copia de la orla reservada en las fechas que indique la dirección del centro.'
      };

      return config.receiptConfig || defaultConfig;
    } catch (error) {
      logger.error('Error getting receipt config:', error);
      return {
        subtitle: 'Reserva de una copia de Orla',
        price: 18,
        footerText: 'Este resguardo es personal e intransferible.\nPor favor, si no eres el/la titular que aparece en él, entrégalo en la dirección del centro para que se lo hagan llegar a su propietario/a.\nEs imprescindible presentar este resguardo para recoger la copia de la orla reservada en las fechas que indique la dirección del centro.'
      };
    }
  });

  // Save receipt configuration
  ipcMain.handle('set-receipt-config', async (event, receiptConfig) => {
    try {
      const { loadGlobalConfig, saveGlobalConfig } = require('../utils/config');
      const config = loadGlobalConfig();
      config.receiptConfig = receiptConfig;
      saveGlobalConfig(config);
      logger.info('[Config] Receipt configuration saved');
      return { success: true };
    } catch (error) {
      logger.error('Error saving receipt config:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Receipt Printing Handler
  // ============================================================================

  // Print receipt for orla payment
  ipcMain.handle('print-orla-receipt', async (event, receiptData) => {
    try {
      const { loadGlobalConfig } = require('../utils/config');
      const fs = require('fs');

      logger.info('[Receipt] Printing receipt for user:', receiptData.userName);

      // Get printer and receipt configuration
      const config = loadGlobalConfig();
      const printerConfig = config.printer;
      const receiptConfig = config.receiptConfig || {
        subtitle: 'Reserva de una copia de Orla',
        price: 18,
        footerText: 'Este resguardo es personal e intransferible.\nPor favor, si no eres el/la titular que aparece en él, entrégalo en la dirección del centro para que se lo hagan llegar a su propietario/a.\nEs imprescindible presentar este resguardo para recoger la copia de la orla reservada en las fechas que indique la dirección del centro.'
      };

      // What goes on the receipt, the same whichever way it is printed
      const logoPath = config.logoPath || '';
      const now = new Date();
      const receipt = {
        logoPath: logoPath && fs.existsSync(logoPath) ? logoPath : '',
        centerName: config.centerName || 'IES La Marxadella',
        subtitle: receiptConfig.subtitle || '',
        userName: receiptData.userName || '',
        groupName: receiptData.groupName || '',
        date: `${now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ` +
          now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        price: receiptPriceOrDefault(receiptConfig.price).toFixed(2),
        footerLines: String(receiptConfig.footerText || '').split('\n').map(line => line.trim()).filter(line => line)
      };

      if (printerConfig && printerConfig.name) {
        logger.info('[Receipt] Using configured printer:', printerConfig.name);
      } else {
        logger.warn('[Receipt] No printer configured, using default');
      }

      // The Windows helper first: sharp text and faster. Chromium only when
      // the helper cannot be used at all; when it is the printer that fails,
      // printing again another way could give two receipts.
      let outcome = null;
      const helper = context.receiptPrinter ? context.receiptPrinter() : null;
      if (helper && helper.isAvailable()) {
        try {
          outcome = await helper.print({ ...receipt, printer: (printerConfig && printerConfig.name) || '' });
          if (outcome.success) {
            logger.info('[Receipt] Printed with the Windows text engine');
          }
        } catch (error) {
          logger.warn(`[Receipt] ${error.message}; printing through Chromium instead`);
        }
      }
      if (!outcome) {
        outcome = await printReceiptWithChromium(receipt, printerConfig);
      }

      if (!outcome.success) {
        const errorType = outcome.error;
        logger.error('[Receipt] Print failed:', errorType);
        return {
          success: false,
          error: printerConfig && printerConfig.name
            ? `La impresora «${printerConfig.displayName || printerConfig.name}» no ha podido imprimir el recibo (${errorType || 'error desconocido'})`
            : `No se ha podido imprimir el recibo: no hay impresora configurada o la predeterminada no responde (${errorType || 'error desconocido'}). Elígela en Archivo > Preferencias... > Impresora de Recibos.`
        };
      }

      logger.info('[Receipt] Receipt printed successfully');
      return { success: true };
    } catch (error) {
      logger.error('[Receipt] Error printing receipt:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Print a receipt as an HTML page, through Chromium
   *
   * The way receipts were printed before the Windows helper, kept for when
   * the helper cannot be used. Its text is less sharp on a thermal printer.
   *
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function printReceiptWithChromium(receipt, printerConfig) {
    const { BrowserWindow } = require('electron');
    const fs = require('fs');

    // The logo goes inline, as a data URL
    let logoBase64 = '';
    if (receipt.logoPath) {
      try {
        const logoData = fs.readFileSync(receipt.logoPath);
        const ext = path.extname(receipt.logoPath).toLowerCase();
        const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        logoBase64 = `data:${mimeType};base64,${logoData.toString('base64')}`;
      } catch (err) {
        logger.warn('[Receipt] Could not load logo:', err.message);
      }
    }

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const receiptHTML = generateReceiptHTML(receipt, logoBase64);

    // Resolves on the page's load event, by which time the logo, an inline
    // data URL, is decoded too. A fixed half-second wait used to follow,
    // adding to every receipt for nothing.
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);

    // Print options for thermal printer (80mm width)
    /** @type {Electron.WebContentsPrintOptions} */
    const printOptions = {
      silent: true, // Silent printing (no dialog)
      printBackground: true,
      margins: {
        marginType: 'none'
      },
      // The height of the driver's roll page. A page cut to the receipt's
      // height was placed in the middle of that one, and the printer fed
      // blank paper before the logo; the driver already trims the blank
      // below the receipt.
      pageSize: {
        width: 80000, // 80mm in microns
        height: 297000
      }
    };
    if (printerConfig && printerConfig.name) {
      printOptions.deviceName = printerConfig.name;
    }

    // Wait for the printer's answer. Reporting success as soon as the job
    // was sent marked receipts as printed when the printer had failed, or
    // when there was no printer at all.
    const { success, errorType } = await new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (ok, reason) => resolve({ success: ok, errorType: reason }));
    });
    printWindow.close();

    return success ? { success: true } : { success: false, error: errorType };
  }

  // The receipt as an HTML page, for printReceiptWithChromium. The Windows
  // helper (native/receipt-printer) draws the same layout.
  function generateReceiptHTML(receipt, logoBase64) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Recibo</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      width: 72mm;
      padding: 5mm 5mm 5mm 2mm;
      font-size: 11pt;
      margin: 0 auto;
    }
    .center {
      text-align: center;
    }
    .bold {
      font-weight: bold;
    }
    .logo {
      text-align: center;
      margin-bottom: 10px;
    }
    .logo img {
      max-width: 50mm;
      max-height: 25mm;
      object-fit: contain;
    }
    .header {
      margin-bottom: 8px;
    }
    .center-name {
      font-size: 16pt;
      font-weight: bold;
      margin-bottom: 3px;
    }
    .subtitle {
      font-size: 11pt;
      margin-bottom: 8px;
    }
    .user-section {
      margin: 12px 0;
      font-size: 13pt;
    }
    .group-row {
      margin-top: 8px;
      font-size: 11pt;
    }
    .date-section {
      margin: 12px 0;
      font-size: 10pt;
    }
    .entrega-section {
      margin: 15px 0;
      font-size: 13pt;
    }
    .footer {
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid #000;
      font-size: 9pt;
      text-align: center;
      line-height: 1.4;
    }
    .footer-line {
      margin-bottom: 6px;
    }
  </style>
</head>
<body>
  ${logoBase64 ? `
  <div class="logo">
    <img src="${logoBase64}" alt="Logo">
  </div>
  ` : ''}

  <div class="header center">
    <div class="center-name">${receipt.centerName}</div>
    <div class="subtitle">${receipt.subtitle}</div>
  </div>

  <div class="user-section center bold">
    ${receipt.userName}
  </div>

  <div class="group-row center">
    Grupo: ${receipt.groupName}
  </div>

  <div class="date-section center">
    Fecha:${receipt.date}
  </div>

  <div class="entrega-section center">
    <strong>Entrega: ${receipt.price}€</strong>
  </div>

  <div class="footer">
    ${receipt.footerLines.map(line => `<div class="footer-line">${line}</div>`).join('')}
  </div>
</body>
</html>
    `.trim();
  }

  // ============================================================================
  // Image Relationships Backup Handlers
  // ============================================================================

  // Backup user-image relationships
  ipcMain.handle('backup-image-relationships', async () => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const result = await state.dbManager.backupUserImageRelationships();
      logger.info(`Backed up ${result.count} image relationships at ${result.backupDate}`);

      return { success: true, ...result };
    } catch (error) {
      logger.error('Error backing up image relationships:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear captured images. Without userIds it clears the whole project.
  ipcMain.handle('clear-captured-images', async (event, userIds) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const result = await state.dbManager.clearCapturedImages(userIds);
      imageGridWindow?.()?.webContents.send('captured-images-changed');
      groupCoverageWindow?.()?.webContents.send('captured-images-changed');
      logger.info(
        `Cleared ${result.cleared} captured image links` +
        (Array.isArray(userIds) ? ` (restricted to ${userIds.length} users)` : ' (whole project)')
      );

      return { success: true, ...result };
    } catch (error) {
      logger.error('Error clearing captured images:', error);
      return { success: false, error: error.message };
    }
  });

  // Restore image relationships from backup
  ipcMain.handle('restore-image-relationships', async (event, backupDate) => {
    try {
      logger.info(`[IPC] Restore image relationships called with backup date: ${backupDate}`);

      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const result = await state.dbManager.restoreUserImageRelationships(backupDate);
      imageGridWindow?.()?.webContents.send('captured-images-changed');
      groupCoverageWindow?.()?.webContents.send('captured-images-changed');
      logger.info(`[IPC] Restored ${result.restored} image relationships from backup ${backupDate}`);

      return { success: true, ...result };
    } catch (error) {
      logger.error('[IPC] Error restoring image relationships:', error);
      return { success: false, error: error.message };
    }
  });

  // Get list of backups
  ipcMain.handle('get-image-backups', async () => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const backups = await state.dbManager.getBackups();
      return { success: true, backups };
    } catch (error) {
      logger.error('Error getting image backups:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete backup
  ipcMain.handle('delete-image-backup', async (event, backupDate) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const result = await state.dbManager.deleteBackup(backupDate);
      logger.info(`Deleted backup ${backupDate} (${result.deleted} records)`);

      return { success: true, ...result };
    } catch (error) {
      logger.error('Error deleting image backup:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Project Details Handler
  // ============================================================================

  // Everything the project information modal shows. Kept apart from
  // 'get-project-info', which the status bar refreshes often and must stay
  // cheap: this one runs four counts and lists the imports folder.
  ipcMain.handle('get-project-details', async () => {
    try {
      if (!state.projectPath || !state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const projectPath = state.projectPath;
      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      const statistics = await state.dbManager.getProjectStatistics();

      // Recorded from the project's second opening onwards; older projects
      // never stored it, so the modal has to cope with it being missing
      const xmlFilePath = await state.dbManager.getProjectSetting('xmlFilePath');

      // The XML shared with the other teams, if this one has been published
      const applied = await getAppliedXml(state.dbManager);
      const publication = applied && applied.fileName ? parsePublishedName(applied.fileName) : null;
      const sharedXml = applied
        ? {
            appliedAt: applied.appliedAt || null,
            fileName: applied.fileName,
            publishedAt: publication ? publication.publishedAt.toISOString() : null,
            publishedBy: publication ? publication.team : null
          }
        : null;

      // A more recent one in Centro, from the last check (check-shared-xml);
      // not looked for here, the modal should not wait on the drive
      const lastCheck = state.sharedXmlCheck;
      const newerSharedXml = lastCheck && lastCheck.key.startsWith(`${projectPath}|`) && lastCheck.result.newer
        ? lastCheck.result.newer
        : null;

      // The captures live on disk, not in the database
      const capturedImages = state.imageManager
        ? (await state.imageManager.getImages()).length
        : 0;

      const mirror = getRepositoryMirror ? getRepositoryMirror() : null;

      // The configured folder can differ from the watched one when it was
      // missing at opening time and the default is standing in for it
      const ingestPath = getActiveIngestPath(state);
      const configuredIngestPath = await getConfiguredIngestPath(state.dbManager);

      return {
        success: true,
        info: {
          name: path.basename(projectPath),
          projectPath,
          xmlFilePath: xmlFilePath || null,
          sharedXml,
          newerSharedXml,
          ingestPath,
          configuredIngestPath,
          ingestIsCustom: Boolean(configuredIngestPath),
          ingestUnavailable: Boolean(configuredIngestPath) && configuredIngestPath !== ingestPath,
          importsPath: path.join(projectPath, 'imports'),
          databasePath: path.join(projectPath, 'data', 'users.db'),
          repositoryPath: repositoryPath || null,
          mirrorPath: mirror ? mirror.mirrorPath : null,
          capturedImages,
          ...statistics
        }
      };
    } catch (error) {
      logger.error('Error getting project info', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Preferences Handlers
  // ============================================================================

  // The preferences window owns the institution and receipt data, the switch
  // of the orla service and what the photo export dialog starts with, only. The
  // display options live in the Ver menu and are saved from there
  // (saveDisplayPreferences); this pair must not read or write them, or saving
  // the window turns them off.

  // Get application preferences
  ipcMain.handle('get-preferences', async () => {
    try {
      const config = loadGlobalConfig();

      // Get receipt config for preferences
      const receiptConfig = config.receiptConfig || {};

      return {
        success: true,
        preferences: {
          centerName: config.centerName || '',
          logoPath: config.logoPath || '',
          receiptSubtitle: receiptConfig.subtitle || '',
          receiptPrice: receiptPriceOrDefault(receiptConfig.price),
          receiptFooter: receiptConfig.footerText || '',
          orlaEnabled: isOrlaServiceEnabled(config),
          exportDefaults: getExportDefaults(config),
          // Stored with the rest of the update checker's state, which reads it
          autoCheckUpdates: getUpdatePreferences().autoCheck !== false
        }
      };
    } catch (error) {
      logger.error('Error getting preferences:', error);
      return { success: false, error: error.message };
    }
  });

  // Save application preferences
  ipcMain.handle('save-preferences', async (event, preferences) => {
    try {
      const config = loadGlobalConfig();
      const wasOrlaEnabled = isOrlaServiceEnabled(config);

      // Update preferences
      config.centerName = preferences.centerName || '';
      config.logoPath = preferences.logoPath || '';

      // Update receipt config
      config.receiptConfig = {
        subtitle: preferences.receiptSubtitle || '',
        price: receiptPriceOrDefault(preferences.receiptPrice),
        footerText: preferences.receiptFooter || ''
      };

      if (typeof preferences.orlaEnabled === 'boolean') {
        config.orla = { ...(config.orla || {}), enabled: preferences.orlaEnabled };
      }

      if (preferences.exportDefaults && typeof preferences.exportDefaults === 'object') {
        config.exportDefaults = normalizeExportDefaults(preferences.exportDefaults);
      }

      let success = saveGlobalConfig(config);

      // After the rest: saveUpdatePreferences reads the file just written
      if (success && typeof preferences.autoCheckUpdates === 'boolean') {
        success = saveUpdatePreferences({ autoCheck: preferences.autoCheckUpdates });
      }

      if (success) {
        logger.info('Preferences saved successfully');

        // The menu and the main window show the service or hide it
        const isOrlaEnabled = isOrlaServiceEnabled(config);
        if (isOrlaEnabled !== wasOrlaEnabled && context.onOrlaServiceChanged) {
          context.onOrlaServiceChanged(isOrlaEnabled);
        }

        return { success: true };
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (error) {
      logger.error('Error saving preferences:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerMiscHandlers };