// @ts-check
/**
 * Export-related IPC handlers
 */
const { ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getImageRepositoryPath, loadGlobalConfig } = require('../utils/config');
const {
  REPLACED_FOLDER,
  scanReplacedArchive,
  purgeReplacedRuns
} = require('../replacedArchive');
const { capitalizeWords } = require('../utils/formatting');
const { compareUsersByName } = require('../utils/nameOrder');
const { groupMissingPhotos, writeMissingPhotosPdf, writeGroupCoveragePdf } = require('../photoReports');
// It loads sharp on first use, so requiring it here costs nothing at boot
const imaging = require('../imageProcessing');

// How many images to process at once. sharp releases the event loop while it
// works, but libuv's thread pool is four threads by default, so going much
// wider mostly queues work up rather than finishing it sooner.
const IMAGE_EXPORT_CONCURRENCY = 4;

// The exports used to replace an empty list with every user in the project,
// so a search with no results sent everyone instead of nobody
const NO_USERS_TO_EXPORT = 'No hay usuarios que exportar con la selección y los filtros actuales';

// Exported images are written to a temporary file and renamed into place. The
// extension matters: the repository mirror only indexes .jpg and .jpeg, so no
// instance ever sees a half written export.
//
// The temporary lives next to its destination, and for the repository that
// folder is shared between machines, so the name carries the host as well as
// the pid: two PCs can hold the same pid and export the same user at once.
const TEMP_EXPORT_PATTERN = /\.[A-Za-z0-9_-]+-\d+-\d+\.tmp$/;
let tempExportCounter = 0;

/**
 * @param {string} destPath
 * @returns {string} Path of the temporary file to write before renaming
 */
function buildTempExportPath(destPath) {
  tempExportCounter += 1;
  const host = os.hostname().replace(/[^A-Za-z0-9_-]/g, '') || 'host';

  return `${destPath}.${host}-${process.pid}-${tempExportCounter}.tmp`;
}

// Windows fails the rename with EPERM or EBUSY while File Stream or an
// antivirus still holds the destination open. It clears in a moment.
const RENAME_ATTEMPTS = 3;
const RENAME_RETRY_DELAY = 150;
const RENAME_RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * Rename, retrying while the destination is briefly locked
 *
 * @param {string} fromPath
 * @param {string} toPath
 * @param {Object} [options]
 * @param {number} [options.attempts]
 * @param {number} [options.delay]
 * @returns {Promise<void>}
 */
async function renameWithRetry(fromPath, toPath, options = {}) {
  const attempts = options.attempts ?? RENAME_ATTEMPTS;
  const delay = options.delay ?? RENAME_RETRY_DELAY;

  for (let attempt = 1; ; attempt++) {
    try {
      await fs.promises.rename(fromPath, toPath);
      return;
    } catch (error) {
      if (attempt >= attempts || !RENAME_RETRYABLE.has(error.code)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Write a buffer to its destination without ever leaving it half written
 *
 * @param {string} destPath
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @param {Object} [options.archive] - Keeps whatever is about to be replaced,
 *   see createReplacedArchive(). Moves it aside once the new bytes are already
 *   on disk, so the window without a photo lasts two renames.
 * @returns {Promise<void>}
 */
async function writeFileAtomically(destPath, buffer, options = {}) {
  let restore = null;

  // Archiving happens before the temporary exists, on purpose. Done the other
  // way round, the move of the old photo and the upload of the temporary hit
  // the same folder at the same time, and Drive File Stream occasionally
  // applied the move to the wrong one: the archived copy came out carrying the
  // temporary's name. On a plain disk the order makes no difference.
  if (options.archive) {
    restore = await options.archive.keep(destPath, buffer);
  }

  const tempPath = buildTempExportPath(destPath);

  try {
    await fs.promises.writeFile(tempPath, buffer);
    await renameWithRetry(tempPath, destPath);
  } catch (error) {
    // Nothing indexes a .tmp, so a leftover would sit there unnoticed
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});

    // The photo was moved aside for a replacement that never happened
    if (restore) {
      await restore();
    }

    throw error;
  }
}

// Replaced photos are kept in a subfolder of the repository (the mirror reads
// the root only, so this never reaches the other instances' local copies).
// Reading and purging that folder is in replacedArchive.js.

/**
 * @param {Date} date
 * @returns {string} YYYYMMDDHHMMSS, the same shape captures are named with
 */
function formatRunStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

/**
 * PDF file name with the moment it was generated, so a list already handed
 * to someone is not overwritten by the next one. CSVs keep fixed names:
 * other programs read them
 * @param {string} baseName - Name without extension
 * @param {Date} [date]
 * @returns {string} `{baseName}_{YYYYMMDDHHMMSS}.pdf`
 */
function stampedPdfName(baseName, date = new Date()) {
  return `${baseName}_${formatRunStamp(date)}.pdf`;
}

/**
 * Keeps the photos an export replaces, instead of letting them be overwritten
 *
 * Moves rather than copies. A copy would have to come from somewhere, and the
 * only local source is the mirror, which can be a minute behind what another
 * instance just wrote: archiving that stale version while the fresh one is lost
 * is worse than archiving nothing. Moving takes exactly what is there, needs no
 * second upload, and is a metadata change within the same Drive.
 *
 * The run folder is created on the first actual replacement, so an export that
 * replaces nothing leaves nothing behind.
 *
 * @param {string} repositoryPath
 * @param {Object|null} mirror - RepositoryMirror, used only as a read shortcut
 * @param {Object} logger
 * @param {Date} [now]
 * @returns {Object} archive
 */
function createReplacedArchive(repositoryPath, mirror, logger, now = new Date()) {
  const host = os.hostname().replace(/[^A-Za-z0-9_-]/g, '') || 'host';
  const baseName = `${formatRunStamp(now)}_${host}`;
  let folderPath = null;
  let kept = 0;

  /**
   * Read what is currently at destPath, from the mirror when it is provably
   * the same bytes and from the repository otherwise
   */
  async function readExisting(destPath, stats) {
    const filename = path.basename(destPath);
    const entry = mirror && typeof mirror.getIndexEntry === 'function'
      ? mirror.getIndexEntry(filename)
      : null;

    if (entry && entry.size === stats.size && entry.mtime === stats.mtimeMs) {
      const mirrorFile = mirror.getMirrorPath(filename);

      if (mirrorFile) {
        try {
          return await fs.promises.readFile(mirrorFile);
        } catch (error) {
          // Gone from the mirror since it was indexed; fall through
        }
      }
    }

    return fs.promises.readFile(destPath);
  }

  async function ensureFolder() {
    if (folderPath) {
      return folderPath;
    }

    let candidate = path.join(repositoryPath, REPLACED_FOLDER, baseName);
    let suffix = 2;

    // A second run in the same second on the same machine should not land in
    // the folder of the first
    while (fs.existsSync(candidate)) {
      candidate = path.join(repositoryPath, REPLACED_FOLDER, `${baseName}-${suffix}`);
      suffix++;
    }

    await fs.promises.mkdir(candidate, { recursive: true });
    folderPath = candidate;
    logger.info(`Replaced photos will be kept in ${folderPath}`);

    return folderPath;
  }

  return {
    /**
     * Move aside whatever destPath holds, if the export really replaces it
     *
     * @param {string} destPath
     * @param {Buffer} buffer - Bytes about to be written
     * @returns {Promise<Function|null>} Undo, or null when nothing was moved
     */
    async keep(destPath, buffer) {
      let stats;

      try {
        stats = await fs.promises.stat(destPath);
      } catch (error) {
        // Nothing there: a new photo, nothing to keep
        return null;
      }

      if (stats.size === buffer.length) {
        try {
          const existing = await readExisting(destPath, stats);

          if (existing.equals(buffer)) {
            // Re-exporting the same photo is not a replacement
            return null;
          }
        } catch (error) {
          logger.warning(`Could not compare ${path.basename(destPath)}, keeping it anyway: ${error.message}`);
        }
      }

      const archivedPath = path.join(await ensureFolder(), path.basename(destPath));
      await renameWithRetry(destPath, archivedPath);
      kept++;

      // Drive has been seen landing the move under a different name. The photo
      // is not lost when that happens, but the folder stops being trustworthy,
      // so say so loudly rather than report a clean run.
      if (!fs.existsSync(archivedPath)) {
        logger.error(`Kept ${path.basename(destPath)} but it is not at ${archivedPath}`);
      }

      return async () => {
        try {
          await renameWithRetry(archivedPath, destPath);
        } catch (error) {
          // Worst case the photo is not where it was, but it is not lost, and
          // the log says where to find it
          logger.error(
            `Could not put ${path.basename(destPath)} back after a failed export. It is at ${archivedPath}`,
            error
          );
        }
      };
    },

    /**
     * @returns {{kept: number, folderPath: string|null}}
     */
    summary() {
      return { kept, folderPath };
    }
  };
}

/**
 * Drop temporary files left behind by an export that died mid-write
 *
 * Invisible to every mirror, so they would pile up in the shared repository
 * with nobody noticing. Only files matching this application's pattern are
 * touched.
 *
 * @param {string} folderPath
 * @param {Object} logger
 * @returns {Promise<number>} How many were removed
 */
async function removeOrphanTempExports(folderPath, logger) {
  let removed = 0;

  try {
    const entries = await fs.promises.readdir(folderPath);

    for (const entry of entries) {
      if (!TEMP_EXPORT_PATTERN.test(entry)) {
        continue;
      }

      try {
        await fs.promises.rm(path.join(folderPath, entry), { force: true });
        removed++;
      } catch (error) {
        logger.warning(`Could not remove leftover temporary file ${entry}: ${error.message}`);
      }
    }

    if (removed > 0) {
      logger.info(`Removed ${removed} leftover temporary export files`);
    }
  } catch (error) {
    logger.warning(`Could not look for leftover temporary files: ${error.message}`);
  }

  return removed;
}

/**
 * List the repository once instead of probing it per user
 *
 * Asking whether each user has a photo used to cost two existsSync calls per
 * user against a folder that is normally on Google Drive. Reading the folder
 * once answers all of them, and still reads the repository itself rather than
 * the local mirror, which may be incomplete.
 *
 * @param {string} repositoryPath
 * @param {Object} logger
 * @returns {Promise<Set<string>>} Lowercase filenames
 */
async function readRepositoryFilenames(repositoryPath, logger) {
  if (!repositoryPath) {
    return new Set();
  }

  try {
    const entries = await fs.promises.readdir(repositoryPath);
    return new Set(entries.map(name => name.toLowerCase()));
  } catch (error) {
    logger.warning(`Could not list the repository at ${repositoryPath}: ${error.message}`);
    return new Set();
  }
}

/**
 * @param {Object} user
 * @param {Set<string>} repositoryFiles - From readRepositoryFilenames
 * @returns {string|null} The matching filename, or null
 */
function findUserRepositoryImage(user, repositoryFiles) {
  const identifier = user.type === 'student' ? user.nia : user.document;
  if (!identifier) {
    return null;
  }

  for (const extension of ['.jpg', '.jpeg']) {
    if (repositoryFiles.has(`${identifier}${extension}`.toLowerCase())) {
      return `${identifier}${extension}`;
    }
  }

  return null;
}

/**
 * Run an async worker over items, a few at a time
 *
 * Results keep the order of the input, whatever order they finish in.
 *
 * @param {Array} items
 * @param {number} limit - Maximum running at once
 * @param {Function} worker - async (item, index) => result
 * @returns {Promise<Array>}
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Write an export copy of an image, resizing it if asked
 *
 * The source is read once into memory. The quality search below may need
 * several encoding passes, and re-reading the original for each of them meant
 * going back to disk up to four times per image.
 *
 * @param {string} sourcePath
 * @param {string} destPath
 * @param {Object} exportOptions
 * @param {Object} logger
 * @param {Object} [writeOptions] - Forwarded to writeFileAtomically; the
 *   repository export passes an archive here, the folder exports do not
 * @returns {Promise<void>}
 */
async function writeExportedImage(sourcePath, destPath, exportOptions, logger, writeOptions = {}) {
  const sourceBuffer = await fs.promises.readFile(sourcePath);

  // Copy the original, correcting the orientation only where it is wrong
  if (exportOptions.copyOriginal && !exportOptions.resizeEnabled) {
    await writeFileAtomically(destPath, await buildOriginalCopy(sourceBuffer), writeOptions);
    return;
  }

  if (!exportOptions.resizeEnabled) {
    return;
  }

  const maxSizeBytes = exportOptions.maxSizeKB * 1024;
  let quality = 90;
  let outputBuffer;

  // Step the quality down until the file fits, as before
  do {
    outputBuffer = await imaging.fitInsideJpeg(sourceBuffer, { box: exportOptions.boxSize, quality });

    if (outputBuffer.length <= maxSizeBytes || quality <= 60) {
      break;
    }

    quality -= 10;
  } while (quality > 0);

  await writeFileAtomically(destPath, outputBuffer, writeOptions);
  logger.info(`Processed image: quality=${quality}, size=${Math.round(outputBuffer.length / 1024)}KB`);
}

/**
 * Bytes to write for a "copy the original" export
 *
 * Re-encoding a JPEG that was copied this way used to bring it out at quality
 * 80 with 4:2:0 subsampling and no metadata, which is not a copy. Turning the
 * pixels only matters when the EXIF orientation says so, and most captures
 * come from a canvas with no EXIF at all.
 *
 * @param {Buffer} sourceBuffer
 * @returns {Promise<Buffer>}
 */
async function buildOriginalCopy(sourceBuffer) {
  // Reads the header only, and throws on a truncated file, which is worth
  // knowing before it reaches the repository
  const { format, orientation } = await imaging.readImageInfo(sourceBuffer);

  if (format === 'jpeg' && orientation === 1) {
    // The very bytes that were read: an exact copy
    return sourceBuffer;
  }

  // Turning cannot avoid re-encoding, so keep the loss residual
  return imaging.encodeUprightJpeg(sourceBuffer, { quality: 95 });
}

/**
 * Helper function to calculate age from birth date
 * @param {string|Date} birthDate - Birth date
 * @param {Object} logger - Logger instance
 * @returns {number} Age in years
 */
function calculateAge(birthDate, logger) {
  if (!birthDate) return 0;

  const today = new Date();
  let birth;

  // Parse the birth date - handle multiple formats
  if (typeof birthDate === 'string') {
    // Check if it's DD/MM/YYYY format
    if (birthDate.includes('/')) {
      const [day, month, year] = birthDate.split('/').map(Number);
      birth = new Date(year, month - 1, day); // month is 0-indexed
    }
    // Check if it's YYYY-MM-DD format (with or without time)
    else if (birthDate.includes('-')) {
      const [year, month, day] = birthDate.split(' ')[0].split('-').map(Number);
      birth = new Date(year, month - 1, day); // month is 0-indexed
    }
    else {
      birth = new Date(birthDate);
    }
  } else {
    birth = new Date(birthDate);
  }

  // Check for invalid date
  if (isNaN(birth.getTime())) {
    logger.warning(`Invalid birth date format: ${birthDate}`);
    return 0;
  }

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Helper function to send progress update to main window
 * @param {Function} getMainWindow - Function to get main window
 * @param {number} processedCount - Number of items processed
 * @param {number} total - Total number of items
 * @param {string} message - Progress message
 */
function sendProgressUpdate(getMainWindow, processedCount, total, message) {
  const percentage = Math.round((processedCount / total) * 100);
  getMainWindow()?.webContents.send('progress', {
    percentage,
    message,
    details: `${processedCount} de ${total} imágenes procesadas`
  });
}

/**
 * File name for an image export named by ID: NIA for students, document for
 * everyone else
 * @param {Object} user
 * @returns {{name: string}|{error: string}}
 */
function idFileName(user) {
  const userId = user.type === 'student' ? user.nia : user.document;
  return userId ? { name: userId } : { error: 'Usuario sin identificador (NIA/DNI)' };
}

/**
 * File name for an image export named "Apellido1 Apellido2, Nombre"
 * @param {Object} user
 * @returns {{name: string}|{error: string}}
 */
function fullNameFileName(user) {
  const apellidos = [capitalizeWords(user.last_name1 || ''), capitalizeWords(user.last_name2 || '')]
    .filter(Boolean)
    .join(' ');
  const fullName = `${apellidos}, ${capitalizeWords(user.first_name || '')}`;

  if (!fullName.trim() || fullName.trim() === ',') {
    return { error: 'Usuario sin nombre completo' };
  }
  return { name: fullName };
}

/**
 * Export one image per user in a folder per group
 *
 * Shared by the image exports, which only differ in where each photo comes
 * from (the captured one in imports, or the user's photo in the repository)
 * and in how each file is named.
 *
 * @param {Object} params
 * @param {Array<Object>} params.users - Users that have a photo to export
 * @param {string} params.folderPath - Destination; group folders go inside
 * @param {Object} params.exportOptions - As for writeExportedImage
 * @param {Function} params.fileNameFor - (user) => {name}|{error}, without extension
 * @param {Function} params.sourceFor - async (user) => {sourcePath, extension}|null
 * @param {string} params.progressMessage
 * @param {Object} params.logger
 * @param {Function} params.getMainWindow
 * @returns {Promise<{total: number, exported: number, withoutGroup: number, errors: Array, groupsFolders: number}>}
 */
async function exportImagesToGroupFolders({
  users, folderPath, exportOptions, fileNameFor, sourceFor, progressMessage, logger, getMainWindow
}) {
  const usersByGroup = {};
  let withoutGroup = 0;

  for (const user of users) {
    if (!user.group_code) {
      logger.warning(`User ${user.first_name} ${user.last_name1} has no group_code`);
      withoutGroup++;
      continue;
    }
    if (!usersByGroup[user.group_code]) {
      usersByGroup[user.group_code] = [];
    }
    usersByGroup[user.group_code].push(user);
  }

  const results = {
    total: users.length - withoutGroup,
    exported: 0,
    withoutGroup,
    errors: [],
    groupsFolders: Object.keys(usersByGroup).length
  };

  logger.info(`Exporting images for ${results.groupsFolders} groups`);

  let processedCount = 0;
  const progress = () => {
    processedCount++;
    sendProgressUpdate(getMainWindow, processedCount, results.total, progressMessage);
  };

  for (const [groupCode, groupUsers] of Object.entries(usersByGroup)) {
    const groupFolderPath = path.join(folderPath, groupCode);

    try {
      if (!fs.existsSync(groupFolderPath)) {
        fs.mkdirSync(groupFolderPath, { recursive: true });
        logger.info(`Created folder for group: ${groupCode}`);
      }
    } catch (error) {
      logger.error(`Error creating folder for group ${groupCode}`, error);
      groupUsers.forEach(user => {
        results.errors.push({
          user: `${user.first_name} ${user.last_name1}`,
          error: `Error al crear carpeta del grupo: ${error.message}`
        });
        progress();
      });
      continue;
    }

    // A few at a time
    await mapWithConcurrency(groupUsers, IMAGE_EXPORT_CONCURRENCY, async (user) => {
      const name = `${user.first_name} ${user.last_name1}`;

      try {
        const fileName = fileNameFor(user);

        if (fileName.error) {
          results.errors.push({ user: name, error: fileName.error });
          return;
        }

        const source = await sourceFor(user);

        if (!source || !fs.existsSync(source.sourcePath)) {
          results.errors.push({ user: name, error: 'Imagen no encontrada' });
          return;
        }

        const destFileName = `${fileName.name}${source.extension}`;
        await writeExportedImage(source.sourcePath, path.join(groupFolderPath, destFileName), exportOptions, logger);

        results.exported++;
        logger.info(`Exported image for user ${name} as ${groupCode}/${destFileName}`);
      } catch (error) {
        results.errors.push({ user: name, error: error.message });
        logger.error(`Error exporting image for user ${name}`, error);
      } finally {
        progress();
      }
    });
  }

  logger.section('EXPORT COMPLETED');
  logger.success(`Exported: ${results.exported}/${results.total} images in ${results.groupsFolders} group folders`);
  if (results.withoutGroup > 0) {
    logger.warning(`Skipped ${results.withoutGroup} users with no group`);
  }
  if (results.errors.length > 0) {
    logger.error(`Errors: ${results.errors.length} images`);
  }

  return results;
}

/**
 * Where to read a repository photo from
 *
 * The local mirror is read when it provably holds the same file (same size and
 * modification time as the repository copy), so an export does not make Google
 * Drive download hundreds of photos it already has on disk. Anything else is
 * read from the repository itself.
 *
 * @param {string} repositoryPath
 * @param {string} filename - As found in the repository
 * @param {Object|null} mirror - RepositoryMirror
 * @returns {Promise<string>}
 */
async function repositoryImageSource(repositoryPath, filename, mirror) {
  const repositoryFile = path.join(repositoryPath, filename);
  const entry = mirror && typeof mirror.getIndexEntry === 'function'
    ? mirror.getIndexEntry(filename)
    : null;

  if (entry) {
    try {
      const stats = await fs.promises.stat(repositoryFile);
      const mirrorFile = mirror.getMirrorPath(filename);

      if (mirrorFile && entry.size === stats.size && entry.mtime === stats.mtimeMs && fs.existsSync(mirrorFile)) {
        return mirrorFile;
      }
    } catch (error) {
      // Not readable from here; let the export report it
    }
  }

  return repositoryFile;
}

/**
 * Split users by whether the repository has a photo for them
 * @param {Array<Object>} users
 * @param {Set<string>} repositoryFiles - From readRepositoryFilenames
 * @returns {{withPhoto: Map<Object, string>, withoutPhoto: number}}
 */
function matchRepositoryImages(users, repositoryFiles) {
  const withPhoto = new Map();
  let withoutPhoto = 0;

  for (const user of users) {
    const filename = findUserRepositoryImage(user, repositoryFiles);
    if (filename) {
      withPhoto.set(user, filename);
    } else {
      withoutPhoto++;
    }
  }

  return { withPhoto, withoutPhoto };
}

// The logo is the same on every page of every PDF, but preparing it means
// reading the config, checking the file and resizing it. Keyed by path and
// modification time so replacing the logo still takes effect.
let cachedLogo = null;

/**
 * Prepare the institution logo for embedding
 * @param {Object} logger
 * @returns {Promise<{buffer: Buffer, aspectRatio: number}|null>}
 */
async function loadInstitutionLogo(logger) {
  const globalConfig = loadGlobalConfig();

  if (!globalConfig || !globalConfig.logoPath) {
    return null;
  }

  const logoPath = globalConfig.logoPath;

  let stats;
  try {
    stats = await fs.promises.stat(logoPath);
  } catch (error) {
    logger.warning(`[addLogoToPDFPage] Logo file not found: ${logoPath}`);
    return null;
  }

  if (cachedLogo && cachedLogo.path === logoPath && cachedLogo.mtimeMs === stats.mtimeMs) {
    return cachedLogo;
  }

  // Drawn at most 60pt high: prepared at 3x for quality, as a PNG to keep
  // its transparency
  const { buffer, width, height } = await imaging.fitHeightPng(logoPath, { height: 180 });

  cachedLogo = {
    path: logoPath,
    mtimeMs: stats.mtimeMs,
    buffer,
    aspectRatio: width / height
  };

  logger.info(`[addLogoToPDFPage] Logo prepared from ${logoPath}`);
  return cachedLogo;
}

/**
 * Helper function to add logo to PDF page
 * @param {PDFKit.PDFDocument} doc - PDFKit document instance
 * @param {Object} logger - Logger instance
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.useFixedPosition] - If true, position at top of page (y=20) instead of using margins
 * @param {number} [options.alignX] - If provided, use this X position instead of default
 * @returns {Promise<void>}
 */
async function addLogoToPDFPage(doc, logger, options = {}) {
  try {
    const logo = await loadInstitutionLogo(logger);

    if (!logo) {
      return;
    }

    const { buffer: logoBuffer, aspectRatio } = logo;
    const logoHeight = 60; // Display height in points (increased from 40pt)
    const logoWidth = logoHeight * aspectRatio;

    // Calculate position
    let x, y;
    if (options.useFixedPosition) {
      // For the photo roster: fixed position at top of page
      x = options.alignX !== undefined ? options.alignX : 20; // Use alignX if provided, else 20pt from left edge
      y = 20; // 20pt from top edge
    } else {
      // For other PDFs: use document margins but move logo up a bit
      x = doc.page.margins.left;
      y = 30; // 30pt from top edge (instead of 50pt margin)
    }

    logger.info(`[addLogoToPDFPage] Logo position: x=${x}, y=${y} (fixedPosition=${options.useFixedPosition}, alignX=${options.alignX})`);

    // Add logo to current page
    doc.image(logoBuffer, x, y, {
      width: logoWidth,
      height: logoHeight
    });

    logger.success('[addLogoToPDFPage] Logo added successfully');

  } catch (error) {
    logger.error('[addLogoToPDFPage] Error adding logo to PDF page:', error);
    // Don't fail the entire export if logo fails, just log the error
  }
}

// Whether exporting the captured photos to the repository also files the
// card print and publication requests of whoever was exported. A choice of
// the team taking the photos, so it is kept per project; projects that never
// set it start with both off.
const REPOSITORY_EXPORT_REQUESTS_KEY = 'repositoryExportRequests';

/**
 * @param {string|null} value - As saved in project_settings
 * @returns {{cards: boolean, publications: boolean}}
 */
function parseRepositoryExportRequests(value) {
  let saved = null;
  try {
    saved = value ? JSON.parse(value) : null;
  } catch {
    saved = null;
  }

  return {
    cards: Boolean(saved && saved.cards === true),
    publications: Boolean(saved && saved.publications === true)
  };
}

/**
 * Register export-related IPC handlers
 * @param {import('./context').IpcContext} context - Shared context, built in main.js
 */
function registerExportHandlers(context) {
  const { mainWindow: getMainWindow, logger, state, repositoryMirror } = context;

  // Export CSV
  ipcMain.handle('export-csv', async (event, folderPath, users) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // An empty list means nobody to export, never the whole project
      if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: NO_USERS_TO_EXPORT };
      }

      // Get repository path
      const repositoryPath = await getImageRepositoryPath(state.dbManager);

      // Counted before filtering: users is reassigned below, and this is what
      // tells the user how many were left out for having no repository photo
      const candidateCount = users.length;

      // Filter users to only include those with images in the repository
      const repositoryFiles = await readRepositoryFilenames(repositoryPath, logger);
      const usersWithRepositoryImages = users.filter(
        user => findUserRepositoryImage(user, repositoryFiles) !== null
      );

      // Log the filtering
      logger.info(`CSV Export: Total users: ${users.length}, Users with repository images: ${usersWithRepositoryImages.length}`);

      // Use the filtered list for export
      users = usersWithRepositoryImages;

      // The users carry only the group code, and the card shows the full name
      const groupNames = new Map(
        (await state.dbManager.getGroups()).map(group => [group.code, group.name])
      );

      // Create CSV content with exact field order from CLAUDE.md
      const csvHeader = 'id;password;userlevel;nombre;apellido1;apellido2;apellidos;centro;foto;grupo;direccion;telefono;departamento;DNI;edad;fechaNacimiento;nombreApellidos\n';
      const csvRows = users.map(user => {
        const isStudent = user.type === 'student';
        const nombre = user.first_name || '';
        const apellido1 = user.last_name1 || '';
        const apellido2 = user.last_name2 || '';
        const apellidos = `${apellido1} ${apellido2}`.trim();
        const documento = user.document || '';
        const nia = user.nia || '';
        const fechaNacimiento = user.birth_date || '';
        const nombreApellidos = `${nombre} ${apellido1} ${apellido2}`.trim();

        // id and password: NIA for students, DNI for others
        const id = isStudent ? nia : documento;
        const password = isStudent ? nia : documento;

        // userlevel: Alumno for students, Profesor for others
        const userlevel = isStudent ? 'Alumno' : 'Profesor';

        // foto: NIA.jpg for students, DNI.jpg for others
        const foto = isStudent ? `${nia}.jpg` : `${documento}.jpg`;

        // edad: mayor.jpg/menor.jpg for students (18+ or not), profesor.jpg for others
        let edad;
        if (isStudent) {
          const age = calculateAge(fechaNacimiento, logger);
          edad = age >= 18 ? 'mayor.jpg' : 'menor.jpg';

          // Log age calculation for debugging
          logger.info(`Age calculation for ${nombre} ${apellido1}: birthDate=${fechaNacimiento}, calculatedAge=${age}, result=${edad}`);
        } else {
          edad = 'profesor.jpg';
        }

        // centro: always "1"
        const centro = '1';
        // grupo: full group name; a code with no group behind it is kept
        // rather than leaving the card without one
        const grupo = user.group_code
          ? (groupNames.get(user.group_code) || user.group_code)
          : '';
        const direccion = '';
        const telefono = '';
        const departamento = '1';
        const DNI = documento;

        return `${id};${password};${userlevel};${nombre};${apellido1};${apellido2};${apellidos};${centro};${foto};${grupo};${direccion};${telefono};${departamento};${DNI};${edad};${fechaNacimiento};${nombreApellidos}`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;

      // Fixed filename: carnets.csv
      const filename = 'carnets.csv';
      const filePath = path.join(folderPath, filename);

      // Write file
      fs.writeFileSync(filePath, csvContent, 'utf8');

      // Calculate statistics for user feedback
      const ignoredUsers = candidateCount - usersWithRepositoryImages.length;

      // Get exported user IDs for card print request checking
      const exportedUserIds = usersWithRepositoryImages.map(user => {
        return user.type === 'student' ? user.nia : user.document;
      }).filter(id => id);

      return {
        success: true,
        filename,
        exported: usersWithRepositoryImages.length,
        ignored: ignoredUsers,
        exportedUserIds
      };
    } catch (error) {
      console.error('Error exporting CSV:', error);
      return { success: false, error: error.message };
    }
  });

  // Export images (placeholder - implementation is very large, continuing in next section)
  ipcMain.handle('export-images', async (event, folderPath, users, options) => {
    try {
      if (!state.dbManager || !state.projectPath) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // Default options
      const exportOptions = {
        copyOriginal: options?.copyOriginal ?? true,
        resizeEnabled: options?.resizeEnabled ?? false,
        boxSize: options?.boxSize ?? 800,
        maxSizeKB: options?.maxSizeKB ?? 500
      };

      logger.section('EXPORTING IMAGES');
      logger.info(`Export folder: ${folderPath}`);
      logger.info(`Export options:`, exportOptions);

      const importsPath = path.join(state.projectPath, 'imports');

      // An empty list means nobody to export, never the whole project
      if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: NO_USERS_TO_EXPORT };
      }

      // Filter only users with images
      const usersWithImages = users.filter(user => user.image_path);

      logger.info(`Found ${usersWithImages.length} users with images`);

      const results = await exportImagesToGroupFolders({
        users: usersWithImages,
        folderPath,
        exportOptions,
        fileNameFor: idFileName,
        sourceFor: async (user) => {
          const sourcePath = path.isAbsolute(user.image_path)
            ? user.image_path
            : path.join(importsPath, user.image_path);
          return { sourcePath, extension: path.extname(sourcePath) };
        },
        progressMessage: 'Exportando imágenes...',
        logger,
        getMainWindow
      });

      return { success: true, results };
    } catch (error) {
      logger.error('Error exporting images', error);
      return { success: false, error: error.message };
    }
  });

  // Export options dialog, when the destination is the repository: whether
  // to also request the cards and the publication of what gets exported
  ipcMain.handle('get-repository-export-requests', async () => {
    try {
      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const value = await state.dbManager.getProjectSetting(REPOSITORY_EXPORT_REQUESTS_KEY);
      return { success: true, requests: parseRepositoryExportRequests(value) };
    } catch (error) {
      logger.error('Error reading the repository export requests setting', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('set-repository-export-requests', async (event, requests) => {
    try {
      if (!state.dbManager) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const value = {
        cards: Boolean(requests && requests.cards === true),
        publications: Boolean(requests && requests.publications === true)
      };
      await state.dbManager.setProjectSetting(REPOSITORY_EXPORT_REQUESTS_KEY, JSON.stringify(value));
      logger.info(`Repository export requests set to cards=${value.cards}, publications=${value.publications}`);

      return { success: true, requests: value };
    } catch (error) {
      logger.error('Error saving the repository export requests setting', error);
      return { success: false, error: error.message };
    }
  });

  // How many of the given users have a photo in the repository, for the
  // summary shown before exporting repository images. Worked out here from
  // the repository itself: what the list knows depends on the Ver options.
  ipcMain.handle('count-repository-images', async (event, users) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado el depósito de imágenes. Por favor, configúralo en Proyecto > Configurar depósito de imágenes' };
      }
      if (!fs.existsSync(repositoryPath)) {
        return { success: false, error: `La carpeta del depósito no existe: ${repositoryPath}` };
      }

      const repositoryFiles = await readRepositoryFilenames(repositoryPath, logger);
      const { withPhoto, withoutPhoto } = matchRepositoryImages(users || [], repositoryFiles);

      return { success: true, withPhoto: withPhoto.size, withoutPhoto };
    } catch (error) {
      logger.error('Error counting repository images', error);
      return { success: false, error: error.message };
    }
  });

  // Export repository images named by ID, like export-images but taking each
  // user's photo from the repository instead of the captured one
  ipcMain.handle('export-repository-images', async (event, folderPath, users, options) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado el depósito de imágenes. Por favor, configúralo en Proyecto > Configurar depósito de imágenes' };
      }
      if (!fs.existsSync(repositoryPath)) {
        return { success: false, error: `La carpeta del depósito no existe: ${repositoryPath}` };
      }

      const exportOptions = {
        copyOriginal: options?.copyOriginal ?? true,
        resizeEnabled: options?.resizeEnabled ?? false,
        boxSize: options?.boxSize ?? 800,
        maxSizeKB: options?.maxSizeKB ?? 500
      };

      logger.section('EXPORTING REPOSITORY IMAGES');
      logger.info(`Export folder: ${folderPath}`);
      logger.info(`Repository path: ${repositoryPath}`);
      logger.info(`Export options:`, exportOptions);

      // Unlike the older exports, an empty list means nothing to export, not
      // the whole project
      const repositoryFiles = await readRepositoryFilenames(repositoryPath, logger);
      const { withPhoto, withoutPhoto } = matchRepositoryImages(users || [], repositoryFiles);

      logger.info(`Users: ${(users || []).length}, with a repository photo: ${withPhoto.size}`);

      const mirror = repositoryMirror ? repositoryMirror() : null;

      const results = await exportImagesToGroupFolders({
        users: [...withPhoto.keys()],
        folderPath,
        exportOptions,
        fileNameFor: idFileName,
        sourceFor: async (user) => ({
          sourcePath: await repositoryImageSource(repositoryPath, withPhoto.get(user), mirror),
          // The repository may hold .jpeg files; the export follows the {ID}.jpg convention
          extension: '.jpg'
        }),
        progressMessage: 'Exportando imágenes del depósito...',
        logger,
        getMainWindow
      });

      return { success: true, results: { ...results, withoutRepositoryImage: withoutPhoto } };
    } catch (error) {
      logger.error('Error exporting repository images', error);
      return { success: false, error: error.message };
    }
  });

  // Export images to repository
  ipcMain.handle('export-to-repository', async (event, users, options) => {
    try {
      if (!state.dbManager || !state.projectPath) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // Get repository path
      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado el depósito de imágenes. Por favor, configúralo en Proyecto > Configurar depósito de imágenes' };
      }

      // Check if repository path exists
      if (!fs.existsSync(repositoryPath)) {
        return { success: false, error: `La carpeta del depósito no existe: ${repositoryPath}` };
      }

      // An empty list means nobody to export, never the whole project
      if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: NO_USERS_TO_EXPORT };
      }

      // Default options
      const exportOptions = {
        copyOriginal: options?.copyOriginal ?? true,
        resizeEnabled: options?.resizeEnabled ?? false,
        boxSize: options?.boxSize ?? 800,
        maxSizeKB: options?.maxSizeKB ?? 500
      };

      logger.section('EXPORTING IMAGES TO REPOSITORY');
      logger.info(`Repository path: ${repositoryPath}`);
      logger.info(`Export options:`, exportOptions);

      // Temporaries from an export that died mid-write are invisible to every
      // mirror, so they would accumulate in the shared folder unnoticed
      await removeOrphanTempExports(repositoryPath, logger);

      // Whatever this export replaces is kept rather than overwritten
      const archive = createReplacedArchive(repositoryPath, repositoryMirror(), logger);

      const importsPath = path.join(state.projectPath, 'imports');

      // Filter only users with images
      const usersWithImages = users.filter(user => user.image_path);

      logger.info(`Found ${usersWithImages.length} users with images`);

      const results = {
        total: usersWithImages.length,
        exported: 0,
        // Who actually reached the repository, so the caller can offer to
        // unlink exactly those and nobody else
        exportedUserIds: [],
        errors: []
      };

      // Track progress
      let processedCount = 0;

      // Export each user's image
      for (const user of usersWithImages) {
        try {
          // Determine the ID to use for filename: NIA for students, document for others
          const isStudent = user.type === 'student';
          const userId = isStudent ? user.nia : user.document;

          if (!userId) {
            results.errors.push({
              user: `${user.first_name} ${user.last_name1}`,
              error: 'Usuario sin identificador (NIA/DNI)'
            });
            continue;
          }

          // Get source image path (relative path in DB)
          const sourceImagePath = path.isAbsolute(user.image_path)
            ? user.image_path
            : path.join(importsPath, user.image_path);

          // Check if source image exists
          if (!fs.existsSync(sourceImagePath)) {
            results.errors.push({
              user: `${user.first_name} ${user.last_name1}`,
              error: 'Imagen no encontrada'
            });
            continue;
          }

          // Create destination filename with user ID in repository
          // Always use .jpg extension (rename .jpeg to .jpg if needed)
          const destFileName = `${userId}.jpg`;
          const destPath = path.join(repositoryPath, destFileName);

          await writeExportedImage(sourceImagePath, destPath, exportOptions, logger, { archive });

          results.exported++;
          results.exportedUserIds.push(user.id);
          logger.info(`Exported image for user ${user.first_name} ${user.last_name1} as ${destFileName}`);
        } catch (error) {
          results.errors.push({
            user: `${user.first_name} ${user.last_name1}`,
            error: error.message
          });
          logger.error(`Error exporting image for user ${user.first_name} ${user.last_name1}`, error);
        } finally {
          // Always update progress, regardless of success or failure. This also
          // runs on `continue`, so the skips above must not count on their own
          processedCount++;
          sendProgressUpdate(getMainWindow, processedCount, results.total, 'Exportando imágenes al depósito...');
        }
      }

      logger.section('EXPORT TO REPOSITORY COMPLETED');
      logger.success(`Exported: ${results.exported}/${results.total} images to repository`);

      const archived = archive.summary();
      results.replaced = archived.kept;
      results.replacedFolder = archived.folderPath;
      if (archived.kept > 0) {
        logger.info(`Kept ${archived.kept} replaced photos in ${archived.folderPath}`);
      }

      if (results.errors.length > 0) {
        logger.error(`Errors: ${results.errors.length} images`);
      }

      // Invalidate repository cache after export
      if (results.exported > 0) {
        state.invalidateRepositoryCache();
        logger.info('Repository cache invalidated after export');
      }

      return { success: true, results };
    } catch (error) {
      logger.error('Error exporting images to repository', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Helper function to create a ZIP archive from images
   * @param {string} zipPath - Full path to the ZIP file to create
   * @param {Array} images - Array of image objects with {path, name} properties
   * @returns {Promise<void>}
   */
  async function createZipArchive(zipPath, images) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archiver = require('archiver');
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add each image to the archive
      for (const image of images) {
        archive.file(image.path, { name: image.name });
      }

      archive.finalize();
    });
  }

  // Export inventory images from repository
  ipcMain.handle('export-inventory-images', async (event, folderPath, users, options) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // Get repository path
      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: false, error: 'No se ha configurado el depósito de imágenes. Por favor, configúralo en Proyecto > Configurar depósito de imágenes' };
      }

      // Default options
      const exportOptions = {
        copyOriginal: options?.copyOriginal ?? true,
        resizeEnabled: options?.resizeEnabled ?? false,
        boxSize: options?.boxSize ?? 800,
        maxSizeKB: options?.maxSizeKB ?? 500,
        zipEnabled: options?.zipEnabled ?? false,
        zipMaxSizeMB: options?.zipMaxSizeMB ?? 25
      };

      logger.section('EXPORTING INVENTORY IMAGES');
      logger.info(`Export folder: ${folderPath}`);
      logger.info(`Export options:`, exportOptions);
      logger.info(`Users to check: ${users.length}`);

      // One listing answers every user, rather than probing the repository twice each
      const repositoryFiles = await readRepositoryFilenames(repositoryPath, logger);

      const results = {
        total: users.length,
        exported: 0,
        skipped: 0,
        errors: []
      };

      // If ZIP is enabled, use temp folder, otherwise use target folder
      const tempFolder = exportOptions.zipEnabled ? path.join(folderPath, '.temp-images') : null;
      const exportFolder = exportOptions.zipEnabled ? tempFolder : folderPath;

      // Create temp folder if needed
      if (tempFolder && !fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder, { recursive: true });
      }

      // Track progress
      let processedCount = 0;

      // Array to store processed image paths for ZIP
      const processedImages = [];

      // Export images for each user
      for (const user of users) {
        try {
          // Determine the ID to use for filename: NIA for students, document for others
          const isStudent = user.type === 'student';
          const userId = isStudent ? user.nia : user.document;

          if (!userId) {
            results.skipped++;
            continue;
          }

          // Check if image exists in repository, using the single listing
          const repositoryFilename = findUserRepositoryImage(user, repositoryFiles);

          if (!repositoryFilename) {
            results.skipped++;
            continue;
          }

          const actualSourcePath = path.join(repositoryPath, repositoryFilename);

          // Create destination filename
          const destFileName = `${userId}.jpg`;
          const destPath = path.join(exportFolder, destFileName);

          await writeExportedImage(actualSourcePath, destPath, exportOptions, logger);

          // Store path for ZIP if enabled
          if (exportOptions.zipEnabled) {
            const { size } = await fs.promises.stat(destPath);
            processedImages.push({
              path: destPath,
              name: destFileName,
              size
            });
          }

          results.exported++;
          logger.info(`Exported image for user ${user.first_name} ${user.last_name1} as ${destFileName}`);
        } catch (error) {
          results.errors.push({
            user: `${user.first_name} ${user.last_name1}`,
            error: error.message
          });
          logger.error(`Error exporting image for user ${user.first_name} ${user.last_name1}`, error);
        } finally {
          // Always update progress
          processedCount++;
          sendProgressUpdate(getMainWindow, processedCount, results.total, 'Exportando imágenes del inventario...');
        }
      }

      // Create ZIP files if enabled
      if (exportOptions.zipEnabled && processedImages.length > 0) {
        logger.info('Creating ZIP archives...');
        const maxSizeBytes = exportOptions.zipMaxSizeMB * 1024 * 1024;
        let currentZipSize = 0;
        let zipIndex = 1;
        let currentZipImages = [];
        const zipFiles = [];

        for (let i = 0; i < processedImages.length; i++) {
          const image = processedImages[i];

          // If adding this image would exceed the max size, create a ZIP and start a new one
          if (currentZipSize + image.size > maxSizeBytes && currentZipImages.length > 0) {
            const zipFileName = processedImages.length <= 1 || (currentZipSize + image.size <= maxSizeBytes && i === processedImages.length - 1)
              ? 'imagenes.zip'
              : `imagenes_${zipIndex}.zip`;
            const zipPath = path.join(folderPath, zipFileName);

            await createZipArchive(zipPath, currentZipImages);
            zipFiles.push({ name: zipFileName, count: currentZipImages.length });

            logger.info(`Created ZIP: ${zipFileName} (${currentZipImages.length} images, ${Math.round(currentZipSize/1024/1024)}MB)`);

            currentZipImages = [];
            currentZipSize = 0;
            zipIndex++;
          }

          currentZipImages.push(image);
          currentZipSize += image.size;
        }

        // Create final ZIP with remaining images
        if (currentZipImages.length > 0) {
          const zipFileName = zipFiles.length === 0 ? 'imagenes.zip' : `imagenes_${zipIndex}.zip`;
          const zipPath = path.join(folderPath, zipFileName);

          await createZipArchive(zipPath, currentZipImages);
          zipFiles.push({ name: zipFileName, count: currentZipImages.length });

          logger.info(`Created ZIP: ${zipFileName} (${currentZipImages.length} images, ${Math.round(currentZipSize/1024/1024)}MB)`);
        }

        // Clean up temp folder
        if (tempFolder && fs.existsSync(tempFolder)) {
          fs.rmSync(tempFolder, { recursive: true, force: true });
        }

        results.zipFiles = zipFiles;
      }

      logger.section('INVENTORY IMAGES EXPORT COMPLETED');
      logger.success(`Exported: ${results.exported}/${results.total} images`);
      logger.info(`Skipped: ${results.skipped} (no image in repository)`);
      if (exportOptions.zipEnabled && results.zipFiles) {
        logger.info(`ZIP files created: ${results.zipFiles.length}`);
      }
      if (results.errors.length > 0) {
        logger.error(`Errors: ${results.errors.length} images`);
      }

      return { success: true, results };
    } catch (error) {
      logger.error('Error exporting inventory images', error);
      return { success: false, error: error.message };
    }
  });

  // Export inventory CSVs (3 files: Alumnado, Personal, Grupos)
  ipcMain.handle('export-inventory-csv', async (event, folderPath, users) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // An empty list means nobody to export, never the whole project
      if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: NO_USERS_TO_EXPORT };
      }

      logger.section('INVENTORY EXPORT');
      logger.info(`Exporting inventory CSVs for ${users.length} users`);

      const results = {
        totalUsers: users.length,
        filesCreated: 0,
        files: []
      };

      // Separate users by type
      const students = users.filter(u => u.type === 'student');
      const staff = users.filter(u => u.type === 'teacher' || u.type === 'non_teaching_staff');

      logger.info(`Students: ${students.length}, Staff: ${staff.length}`);

      // 1. Generate Alumnado.csv (Students)
      try {
        // CSV header (comma-delimited)
        const csvHeader = 'Codigo,Nombre,Apellido1,Apellido2,Fecha Nacimiento,Grupo\n';

        // Generate CSV rows
        const csvRows = students.map(user => {
          const codigo = user.nia || '';
          const nombre = user.first_name || '';
          const apellido1 = user.last_name1 || '';
          const apellido2 = user.last_name2 || '';
          const fechaNacimiento = user.birth_date || '';
          const grupo = user.group_code || '';

          // Escape fields that might contain commas
          const escapeCSV = (field) => {
            if (field.includes(',') || field.includes('"') || field.includes('\n')) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          };

          return `${escapeCSV(codigo)},${escapeCSV(nombre)},${escapeCSV(apellido1)},${escapeCSV(apellido2)},${escapeCSV(fechaNacimiento)},${escapeCSV(grupo)}`;
        }).join('\n');

        const csvContent = csvHeader + csvRows;
        const filename = 'Alumnado.csv';
        const filePath = path.join(folderPath, filename);

        fs.writeFileSync(filePath, csvContent, 'utf8');

        results.filesCreated++;
        results.files.push({
          filename,
          userCount: students.length,
          type: 'Alumnado'
        });

        logger.success(`Created ${filename} (${students.length} students)`);
      } catch (error) {
        logger.error('Error creating Alumnado.csv:', error);
      }

      // 2. Generate Personal.csv (Staff)
      try {
        // CSV header (comma-delimited)
        const csvHeader = 'Función,Documento,Nombre,Apellido1,Apellido2,Fecha Nacimiento,Teléfono 1,Teléfono 2,Email\n';

        // Generate CSV rows
        const csvRows = staff.map(user => {
          // Función: "Docente" for teachers, "No Docente" for non-teaching staff
          const funcion = user.type === 'teacher' ? 'Docente' : 'No Docente';
          const documento = user.document || '';
          const nombre = user.first_name || '';
          const apellido1 = user.last_name1 || '';
          const apellido2 = user.last_name2 || '';
          const fechaNacimiento = user.birth_date || '';
          const telefono1 = '';
          const telefono2 = '';
          const email = '';

          // Escape fields that might contain commas
          const escapeCSV = (field) => {
            if (field.includes(',') || field.includes('"') || field.includes('\n')) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          };

          return `${escapeCSV(funcion)},${escapeCSV(documento)},${escapeCSV(nombre)},${escapeCSV(apellido1)},${escapeCSV(apellido2)},${escapeCSV(fechaNacimiento)},${escapeCSV(telefono1)},${escapeCSV(telefono2)},${escapeCSV(email)}`;
        }).join('\n');

        const csvContent = csvHeader + csvRows;
        const filename = 'Personal.csv';
        const filePath = path.join(folderPath, filename);

        fs.writeFileSync(filePath, csvContent, 'utf8');

        results.filesCreated++;
        results.files.push({
          filename,
          userCount: staff.length,
          type: 'Personal'
        });

        logger.success(`Created ${filename} (${staff.length} staff)`);
      } catch (error) {
        logger.error('Error creating Personal.csv:', error);
      }

      // 3. Generate Grupos.csv (Groups)
      try {
        // Get all groups from database
        const groups = await state.dbManager.getGroups();

        // CSV header (comma-delimited)
        const csvHeader = 'CódigoGrupo,Nombre\n';

        // Generate CSV rows
        const csvRows = groups.map(group => {
          const codigoGrupo = group.code || '';
          const nombre = group.name || '';

          // Escape fields that might contain commas
          const escapeCSV = (field) => {
            if (field.includes(',') || field.includes('"') || field.includes('\n')) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          };

          return `${escapeCSV(codigoGrupo)},${escapeCSV(nombre)}`;
        }).join('\n');

        const csvContent = csvHeader + csvRows;
        const filename = 'Grupos.csv';
        const filePath = path.join(folderPath, filename);

        fs.writeFileSync(filePath, csvContent, 'utf8');

        results.filesCreated++;
        results.files.push({
          filename,
          userCount: groups.length,
          type: 'Grupos'
        });

        logger.success(`Created ${filename} (${groups.length} groups)`);
      } catch (error) {
        logger.error('Error creating Grupos.csv:', error);
      }

      logger.section('INVENTORY EXPORT COMPLETED');
      logger.success(`Created ${results.filesCreated} CSV files`);

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Error exporting inventory CSV:', error);
      return { success: false, error: error.message };
    }
  });

  // Export images with name format (Apellido1 Apellido2, Nombre)
  ipcMain.handle('export-images-name', async (event, folderPath, users, options) => {
    try {
      if (!state.dbManager || !state.projectPath) {
        throw new Error('No hay ningún proyecto abierto');
      }

      // Default options
      const exportOptions = {
        copyOriginal: options?.copyOriginal ?? true,
        resizeEnabled: options?.resizeEnabled ?? false,
        boxSize: options?.boxSize ?? 800,
        maxSizeKB: options?.maxSizeKB ?? 500
      };

      logger.section('EXPORTING IMAGES BY NAME');
      logger.info(`Export folder: ${folderPath}`);
      logger.info(`Export options:`, exportOptions);

      const importsPath = path.join(state.projectPath, 'imports');

      // An empty list means nobody to export, never the whole project
      if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: NO_USERS_TO_EXPORT };
      }

      // Filter only users with images
      const usersWithImages = users.filter(user => user.image_path);

      logger.info(`Found ${usersWithImages.length} users with images`);

      const results = await exportImagesToGroupFolders({
        users: usersWithImages,
        folderPath,
        exportOptions,
        fileNameFor: fullNameFileName,
        sourceFor: async (user) => {
          const sourcePath = path.isAbsolute(user.image_path)
            ? user.image_path
            : path.join(importsPath, user.image_path);
          return { sourcePath, extension: path.extname(sourcePath) };
        },
        progressMessage: 'Exportando imágenes...',
        logger,
        getMainWindow
      });

      return { success: true, results };
    } catch (error) {
      logger.error('Error exporting images by name', error);
      return { success: false, error: error.message };
    }
  });

  // Photo roster PDF: everyone in a group with their photo, so staff can put a
  // name to a face. Not the graduation orla, which is a paid service
  ipcMain.handle('export-photo-roster-pdf', async (event, { exportPath, photoSource, imageQuality, usersByGroup }) => {
    const PDFDocument = require('pdfkit');

    try {
      logger.section('PHOTO ROSTER PDF EXPORT');
      logger.info(`Export path: ${exportPath}`);
      logger.info(`Photo source: ${photoSource}`);
      logger.info(`Image quality: ${imageQuality}`);
      logger.info(`Groups with users: ${Object.keys(usersByGroup).length}`);

      const generatedFiles = [];
      // One stamp for the whole run, so the groups of an export go together
      const generatedAt = new Date();

      // Resolved once: this is a project setting, and it used to be read from
      // the database again for every user without a photo path
      const rosterRepositoryPath = photoSource === 'repository'
        ? await getImageRepositoryPath(state.dbManager)
        : null;

      const totalUsers = Object.values(usersByGroup).reduce(
        (sum, groupUsers) => sum + groupUsers.length,
        0
      );
      let processedUsers = 0;

      // Generate one PDF per group
      for (const [groupCode, users] of Object.entries(usersByGroup)) {
        logger.info(`Generating PDF for group: ${groupCode} (${users.length} users)`);

        // Calculate grid layout - 6 columns x 6 rows per page
        const imagesPerRow = 6;
        const rowsPerPage = 6; // All pages: 6x6 = 36 photos

        // Aspect ratio 3:4 (width:height) for vertical portrait photos
        const imageWidth = 72;
        const imageHeight = 96; // 72 * 4/3 = 96
        const imageSpacing = 7;
        const nameHeight = 20;
        const cellHeight = imageHeight + nameHeight + imageSpacing;

        // A4 dimensions in points
        const pageWidthPt = 595.28; // A4 width
        const pageHeightPt = 841.89; // A4 height

        // Calculate total grid height for first page (with title)
        const titleHeight = 40; // Height for title and spacing
        const gridHeight = cellHeight * rowsPerPage;
        const totalContentHeightFirstPage = titleHeight + gridHeight;

        // Center vertically on first page (with extra margin)
        const topMarginFirstPage = Math.floor((pageHeightPt - totalContentHeightFirstPage) / 2) + 20;

        // Center vertically on subsequent pages (without title, with extra margin)
        const topMarginFullPage = Math.floor((pageHeightPt - gridHeight) / 2) + 20;

        // Create PDF document with calculated margins for first page
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'portrait',
          margins: { top: topMarginFirstPage, bottom: topMarginFirstPage, left: 20, right: 20 }
        });

        // Create output file path
        const fileName = stampedPdfName(`Listado_fotos_${groupCode}`, generatedAt);
        const filePath = path.join(exportPath, fileName);

        // Pipe PDF to file
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Calculate starting X position to center the grid (needed for logo alignment)
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const totalGridWidth = (imageWidth + imageSpacing) * imagesPerRow - imageSpacing;
        const startX = doc.page.margins.left + (pageWidth - totalGridWidth) / 2;

        // Add logo to first page (aligned with first column of photos)
        await addLogoToPDFPage(doc, logger, { useFixedPosition: true, alignX: startX });

        // Add title
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .text(`Listado con fotografías - ${groupCode}`, { align: 'center' });

        doc.moveDown(0.5);
        const titleY = doc.y; // Save Y position after title

        // Page dimensions
        const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

        let currentX = startX;
        let currentY = titleY;
        let count = 0;

        users.sort(compareUsersByName);

        // Process each user
        for (const user of users) {
          // Check if we're at the start of a new row and if this row would fit on current page
          const isStartOfRow = (count % imagesPerRow === 0);

          if (isStartOfRow && count > 0) {
            // Check if there's enough space for a complete row (cellHeight includes image + name + spacing)
            const spaceNeeded = cellHeight;
            const spaceAvailable = (doc.page.height - doc.page.margins.bottom) - currentY;

            if (spaceAvailable < spaceNeeded) {
              // Not enough space, create new page
              // addPage() replaces the document options instead of merging them:
              // without size and layout, PDFKit falls back to Letter
              doc.addPage({
                size: 'A4',
                layout: 'portrait',
                margins: { top: topMarginFullPage, bottom: topMarginFullPage, left: 20, right: 20 }
              });
              // Add logo to new page (aligned with first column of photos)
              await addLogoToPDFPage(doc, logger, { useFixedPosition: true, alignX: startX });
              // Start grid below logo (logo is at y=20 with height=60pt, so start at y=90 with some spacing)
              currentY = 90; // 20 (logo Y) + 60 (logo height) + 10 (spacing) = 90
              currentX = startX;
              count = 0;
            }
          }

          // Get image path
          let imagePath = photoSource === 'captured'
            ? user.image_path
            : user.repository_image_path;

          // If using repository photos and path is not set, try to construct it
          if (photoSource === 'repository' && !imagePath && rosterRepositoryPath) {
            const isStudent = user.type === 'student';
            const userId = isStudent ? user.nia : user.document;
            if (userId) {
              const filename = `${userId}.jpg`;
              const mirror = repositoryMirror();
              const mirrorPath = mirror ? mirror.getMirrorPath(filename) : null;
              imagePath = mirrorPath || path.join(rosterRepositoryPath, filename);
            }
          }

          // Draw image or placeholder
          if (imagePath && fs.existsSync(imagePath)) {
            try {
              // Filling the 3:4 portrait cell, upright, at 3x the size it is
              // drawn for quality in the PDF
              const imageBuffer = await imaging.coverJpeg(imagePath, {
                width: imageWidth * 3, // 216px for 72pt display
                height: imageHeight * 3, // 288px for 96pt display
                quality: imageQuality
              });

              doc.image(imageBuffer, currentX, currentY, {
                width: imageWidth,
                height: imageHeight
              });
            } catch (error) {
              logger.error(`Error loading image for user ${user.first_name} ${user.last_name1}:`, error);
              // Draw placeholder on error
              doc.rect(currentX, currentY, imageWidth, imageHeight)
                 .stroke('#cccccc');
            }
          } else {
            // Draw placeholder rectangle with light gray background
            doc.rect(currentX, currentY, imageWidth, imageHeight)
               .fillAndStroke('#f5f5f5', '#cccccc');

            // Draw simple user icon using SVG-like shapes
            const centerX = currentX + imageWidth / 2;
            const centerY = currentY + imageHeight / 2;

            // Draw head circle
            doc.circle(centerX, centerY - 20, 15)
               .fillAndStroke('#cccccc', '#aaaaaa');

            // Draw body (simplified trapezoid using lines)
            doc.moveTo(centerX - 20, centerY + 35)
               .lineTo(centerX - 12, centerY + 15)
               .lineTo(centerX + 12, centerY + 15)
               .lineTo(centerX + 20, centerY + 35)
               .fillAndStroke('#cccccc', '#aaaaaa');
          }

          // Draw user name below image (always in black)
          // Format: Apellido1 Apellido2, Nombre
          const lastName2 = user.last_name2 ? ` ${user.last_name2}` : '';
          const fullName = `${user.last_name1}${lastName2}, ${user.first_name}`;
          doc.fillColor('#000000')
             .fontSize(7)
             .font('Helvetica')
             .text(fullName, currentX, currentY + imageHeight + 3, {
               width: imageWidth,
               align: 'center',
               lineBreak: false,
               ellipsis: true
             });

          // Move to next position
          count++;
          if (count % imagesPerRow === 0) {
            // Move to next row
            currentX = startX;
            currentY += cellHeight;
          } else {
            // Move to next column
            currentX += imageWidth + imageSpacing;
          }

          // pdfkit draws synchronously, so without giving the event loop a turn
          // between photos the whole app, menus included, stays frozen for the
          // length of the export
          processedUsers++;
          if (processedUsers % 10 === 0) {
            sendProgressUpdate(
              getMainWindow,
              processedUsers,
              totalUsers,
              `Generando el listado de ${groupCode}`
            );
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        // Finalize PDF
        doc.end();

        // Wait for write stream to finish
        await new Promise((resolve, reject) => {
          writeStream.on('finish', () => resolve(undefined));
          writeStream.on('error', reject);
        });

        logger.success(`Generated PDF: ${fileName}`);
        generatedFiles.push(fileName);

        // Same scale as the updates inside the group: counting groups here
        // made the bar jump back and forth between the two
        sendProgressUpdate(getMainWindow, processedUsers, totalUsers, `PDF generado: ${fileName}`);
      }

      logger.section('PHOTO ROSTER PDF EXPORT COMPLETED');
      logger.success(`Generated ${generatedFiles.length} PDF file(s)`);

      return { success: true, generatedFiles };
    } catch (error) {
      logger.error('Error exporting photo roster PDF', error);
      return { success: false, error: error.message };
    }
  });

  // Export Paid Users List PDF (all groups in one document)
  ipcMain.handle('export-paid-users-list-pdf', async (event, { exportPath, usersByGroup }) => {
    const PDFDocument = require('pdfkit');

    try {
      logger.section('PAID USERS LIST PDF EXPORT');
      logger.info(`Export path: ${exportPath}`);
      logger.info(`Groups with users: ${Object.keys(usersByGroup).length}`);

      const groupCodes = Object.keys(usersByGroup).sort();

      // Create single PDF for all groups
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const fileName = stampedPdfName('Alumnos_Pagados');
      const filePath = path.join(exportPath, fileName);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Add logo to first page
      await addLogoToPDFPage(doc, logger);

      // Main title
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .text('Alumnos con Orla Pagada', { align: 'center' });

      doc.moveDown(2);

      let totalUsers = 0;
      let globalIndex = 1;

      // Process each group
      for (let groupIndex = 0; groupIndex < groupCodes.length; groupIndex++) {
        const groupCode = groupCodes[groupIndex];
        const users = usersByGroup[groupCode];

        users.sort(compareUsersByName);

        totalUsers += users.length;

        // Add some space between groups (except first)
        if (groupIndex > 0) {
          doc.moveDown(1.5);
        }

        // Group title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .text(`Grupo ${groupCode}`, { underline: true });

        doc.moveDown(0.5);

        // List users
        doc.fontSize(11)
           .font('Helvetica');

        for (const user of users) {
          const lastName2 = user.last_name2 ? ` ${user.last_name2}` : '';
          const fullName = `${user.last_name1}${lastName2}, ${user.first_name}`;

          // Check if we need a new page
          if (doc.y > 750) {
            doc.addPage();
            // Add logo to new page
            await addLogoToPDFPage(doc, logger);
            // Move cursor below logo (logo at y=30 with height=60pt, so start at y=120)
            doc.y = 120; // 30 (logo Y) + 60 (logo height) + 30 (spacing) = 120
            doc.fontSize(11).font('Helvetica');
          }

          doc.text(`${globalIndex}. ${fullName}`, 50, doc.y, { continued: true, width: 440 })
             .text(user.group_code, 500, doc.y, { width: 50 });

          doc.moveDown(0.3);
          globalIndex++;
        }

        // Group subtotal
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text(`Subtotal grupo ${groupCode}: ${users.length} alumno${users.length !== 1 ? 's' : ''}`, 50, doc.y);

        doc.moveDown(0.5);
      }

      // Add final page with total
      doc.addPage();
      // Add logo to summary page
      await addLogoToPDFPage(doc, logger);
      // Move cursor below logo
      doc.y = 120; // 30 (logo Y) + 60 (logo height) + 30 (spacing) = 120
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .text('Resumen', { align: 'center' });

      doc.moveDown(1);

      doc.fontSize(12)
         .font('Helvetica')
         .text(`Total de grupos: ${groupCodes.length}`, 50);

      doc.text(`Total de alumnos: ${totalUsers}`, 50);

      doc.end();

      await new Promise((resolve) => stream.on('finish', () => resolve(undefined)));

      logger.section('PAID USERS LIST PDF EXPORT COMPLETED');
      logger.success(`Generated PDF: ${fileName}`);

      return { success: true, fileName };
    } catch (error) {
      logger.error('Error exporting paid users list PDF', error);
      return { success: false, error: error.message };
    }
  });

  // Users without a photo, as a PDF with a page per group: without a captured
  // photo linked, or without a photo in the repository
  ipcMain.handle('export-missing-photos-pdf', async (event, { exportPath, users, source, scopeLabel }) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }
      if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: NO_USERS_TO_EXPORT };
      }

      let hasPhoto = (user) => Boolean(user.image_path);
      let baseName = 'Usuarios_sin_foto_capturada';

      if (source === 'repository') {
        const repositoryPath = await getImageRepositoryPath(state.dbManager);
        if (!repositoryPath) {
          return { success: false, error: 'No se ha configurado el depósito de imágenes. Por favor, configúralo en Proyecto > Configurar depósito de imágenes' };
        }
        if (!fs.existsSync(repositoryPath)) {
          return { success: false, error: `La carpeta del depósito no existe: ${repositoryPath}` };
        }
        const repositoryFiles = await readRepositoryFilenames(repositoryPath, logger);
        hasPhoto = (user) => findUserRepositoryImage(user, repositoryFiles) !== null;
        baseName = 'Usuarios_sin_foto_en_deposito';
      }

      const groupNames = new Map((await state.dbManager.getGroups()).map((group) => [group.code, group.name]));
      const groups = groupMissingPhotos(users, hasPhoto, groupNames);
      const total = groups.reduce((sum, group) => sum + group.total, 0);
      const missing = groups.reduce((sum, group) => sum + group.withoutImage, 0);

      logger.info(`[export-missing-photos-pdf] ${source}: ${missing} of ${total} users without a photo`);

      // Nothing to hand anyone: say so instead of writing an empty list
      if (missing === 0) {
        return { success: true, fileName: null, total, missing };
      }

      const fileName = stampedPdfName(baseName);
      await writeMissingPhotosPdf(path.join(exportPath, fileName), {
        source,
        groups,
        scopeLabel,
        projectName: state.projectPath ? path.basename(state.projectPath) : '',
        drawLogo: (doc) => addLogoToPDFPage(doc, logger)
      });

      logger.success(`[export-missing-photos-pdf] Generated ${fileName}`);
      return {
        success: true,
        fileName,
        total,
        missing,
        groups: groups.filter((group) => group.withoutImage > 0).length
      };
    } catch (error) {
      logger.error('Error exporting the missing photos PDF', error);
      return { success: false, error: error.message };
    }
  });

  // Ver > Fotografías por grupo on paper, with the captured photos and, when
  // it can be read, the repository side by side
  ipcMain.handle('export-group-coverage-pdf', async (event, { exportPath }) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const captured = await state.dbManager.getGroupPhotoCoverage();
      if (captured.length === 0) {
        return { success: false, error: 'El proyecto no tiene usuarios' };
      }

      // Without the repository the captured figures are still worth having
      let repository = null;
      let repositoryNote = '';
      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        repositoryNote = 'no se ha configurado.';
      } else if (!fs.existsSync(repositoryPath)) {
        repositoryNote = `la carpeta no está disponible (${repositoryPath}).`;
      } else {
        const repositoryFiles = await readRepositoryFilenames(repositoryPath, logger);
        repository = await state.dbManager.getGroupPhotoCoverage(
          (user) => findUserRepositoryImage(user, repositoryFiles) !== null
        );
      }

      const fileName = stampedPdfName('Estadisticas_fotografias_por_grupo');
      await writeGroupCoveragePdf(path.join(exportPath, fileName), {
        captured,
        repository,
        repositoryNote,
        projectName: state.projectPath ? path.basename(state.projectPath) : '',
        drawLogo: (doc) => addLogoToPDFPage(doc, logger)
      });

      logger.success(`[export-group-coverage-pdf] Generated ${fileName}`);
      return { success: true, fileName, includesRepository: repository !== null, repositoryNote };
    } catch (error) {
      logger.error('Error exporting the photos by group PDF', error);
      return { success: false, error: error.message };
    }
  });

  // Export Paid Users List CSV
  ipcMain.handle('export-paid-users-csv', async (event, { exportPath, users }) => {
    try {
      logger.section('PAID USERS CSV EXPORT');
      logger.info(`Export path: ${exportPath}`);
      logger.info(`Total users: ${users.length}`);

      // Sort users by group, then alphabetically by last name
      users.sort((a, b) => {
        const groupA = (a.group_code || '').toLowerCase();
        const groupB = (b.group_code || '').toLowerCase();

        if (groupA !== groupB) return groupA.localeCompare(groupB);
        return compareUsersByName(a, b);
      });

      // Build CSV content
      const csvRows = [];

      // Header
      csvRows.push('Grupo,Apellido1,Apellido2,Nombre');

      // Data rows
      users.forEach(user => {
        const group = user.group_code || '';
        const lastName1 = user.last_name1 || '';
        const lastName2 = user.last_name2 || '';
        const firstName = user.first_name || '';

        // Escape fields that contain commas or quotes
        const escapeField = (field) => {
          if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        };

        csvRows.push(`${escapeField(group)},${escapeField(lastName1)},${escapeField(lastName2)},${escapeField(firstName)}`);
      });

      const csvContent = csvRows.join('\n');
      const fileName = 'Alumnos_Pagados.csv';
      const filePath = path.join(exportPath, fileName);

      // Write CSV file
      fs.writeFileSync(filePath, csvContent, 'utf8');

      logger.section('PAID USERS CSV EXPORT COMPLETED');
      logger.success(`Generated CSV: ${fileName}`);

      return { success: true, fileName };
    } catch (error) {
      logger.error('Error exporting paid users CSV', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * What the folder of replaced photos holds, for the purge window. Sizes are
   * asked for here: the window can afford the wait, and what it is really
   * answering is how much space a purge would free.
   */
  ipcMain.handle('scan-replaced-archive', async () => {
    try {
      const repositoryPath = await getImageRepositoryPath(state.dbManager);

      if (!repositoryPath) {
        return { success: false, error: 'No hay ningún depósito de imágenes configurado.' };
      }

      const scan = await scanReplacedArchive(repositoryPath, { withSizes: true });

      return {
        success: true,
        folder: scan.folder,
        photos: scan.photos,
        bytes: scan.bytes,
        strangers: scan.strangers,
        // Dates travel as ISO strings: the renderer turns them back
        runs: scan.runs.map((run) => ({
          name: run.name,
          date: run.date.toISOString(),
          host: run.host,
          photos: run.photos,
          bytes: run.bytes
        }))
      };
    } catch (error) {
      logger.error('Error reading the replaced photos folder', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete the runs older than `before` (an ISO date), or all of them without
   * it. Only the app asks for this, and only after someone confirmed it.
   */
  ipcMain.handle('purge-replaced-archive', async (event, before = null) => {
    try {
      const repositoryPath = await getImageRepositoryPath(state.dbManager);

      if (!repositoryPath) {
        return { success: false, error: 'No hay ningún depósito de imágenes configurado.' };
      }

      logger.section('PURGING REPLACED PHOTOS');
      const removed = await purgeReplacedRuns(repositoryPath, { before, logger });

      return { success: true, ...removed };
    } catch (error) {
      logger.error('Error purging the replaced photos folder', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerExportHandlers,
  // Exported for tests: these carry the image processing shared by every export
  readRepositoryFilenames,
  findUserRepositoryImage,
  mapWithConcurrency,
  writeExportedImage,
  buildOriginalCopy,
  writeFileAtomically,
  renameWithRetry,
  removeOrphanTempExports,
  createReplacedArchive,
  stampedPdfName,
  parseRepositoryExportRequests
};