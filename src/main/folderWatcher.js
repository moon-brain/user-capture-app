// @ts-check
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Patterns to ignore: temporary files from Google Drive, Office, and partial downloads
const IGNORE_RE = [
  /(^|[\/\\])\../,           // Hidden files (dotfiles)
  /\.tmp$/i,                 // Generic temporary files
  /\.partial$/i,             // Partial downloads
  /\.crdownload$/i,          // Chrome partial downloads
  /\.gd(tmp|ownloading)$/i,  // Google Drive temporary files
  /~\$.*/                    // Office temporary files
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

class FolderWatcher extends EventEmitter {
  /**
   * @param {string} ingestPath
   * @param {string} importsPath
   * @param {Object} [options]
   * @param {Function} [options.processImport] - (destination, source) =>
   *   Promise, run on every photo once it is in imports and before it is
   *   announced; the project's automatic rotation goes here. A failure is only
   *   logged: the photo stays imported as it came.
   */
  constructor(ingestPath, importsPath, options = {}) {
    super();
    this.ingestPath = ingestPath;
    this.importsPath = importsPath;
    this.processImport = options.processImport || null;
    this.watcher = null;
    this.isProcessing = new Set();
    this.pendingTimers = new Set();
  }

  /**
   * Start watching the ingest folder
   *
   * Resolves once chokidar has finished its initial scan. Files that appear
   * before that are treated as pre-existing and never reported, so anything
   * that needs its writes to be seen must wait for this.
   *
   * @returns {Promise<void>}
   */
  start() {
    // Watch the ingest folder for new images
    this.watcher = chokidar.watch(this.ingestPath, {
      ignored: (filePath) => this.isIgnored(filePath),
      persistent: true,
      ignoreInitial: true,
      depth: 1,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 50
      }
    });

    this.watcher
      .on('add', (filePath) => this.handleNewFile(filePath))
      .on('error', (error) => console.error('Watcher error:', error));

    const watcher = this.watcher;
    return new Promise((resolve) => {
      watcher.once('ready', () => {
        console.log('Folder watcher started on:', this.ingestPath);
        resolve();
      });
    });
  }

  /**
   * Whether a path under the ingest folder should be left alone
   *
   * The patterns are matched against the path relative to the ingest folder,
   * not the full one: a project may watch any folder, and one sitting under a
   * dot-prefixed folder would otherwise look hidden and have every file in it
   * ignored.
   *
   * @param {string} filePath
   * @returns {boolean}
   */
  isIgnored(filePath) {
    const relative = path.relative(this.ingestPath, filePath);
    if (relative === '') {
      return false;
    }
    return IGNORE_RE.some((pattern) => pattern.test(relative));
  }

  async handleNewFile(filePath) {
    // Prevent processing the same file multiple times
    if (this.isProcessing.has(filePath)) {
      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    // Only process JPG files
    if (ext !== '.jpg' && ext !== '.jpeg') {
      console.log('Ignoring non-JPG file:', filePath);
      return;
    }

    // Emit event immediately when image is detected (before processing)
    this.emit('image-detecting', path.basename(filePath));

    this.isProcessing.add(filePath);

    try {
      // Wait a bit to ensure file is completely written
      await this.waitForFileStability(filePath);

      // Validate file size (max 5MB)
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_IMAGE_SIZE) {
        console.error('File too large:', filePath);
        this.isProcessing.delete(filePath);
        this.emit('image-rejected', {
          filename: path.basename(filePath),
          message: `La foto ${path.basename(filePath)} pesa más de 5 MB y no se ha importado. Sigue en la carpeta de entrada.`
        });
        return;
      }

      // Generate formatted filename with timestamp
      const timestamp = new Date();
      const formattedName = this.formatTimestamp(timestamp);
      const ext = path.extname(filePath);
      let newFilename = `${formattedName}${ext}`;
      let destinationPath = path.join(this.importsPath, newFilename);

      // Handle duplicate filenames (same second)
      let finalDestination = destinationPath;
      let counter = 1;
      while (fs.existsSync(finalDestination)) {
        newFilename = `${formattedName}_${counter}${ext}`;
        finalDestination = path.join(this.importsPath, newFilename);
        counter++;
      }

      this.moveFile(filePath, finalDestination);

      console.log('Image moved to imports:', path.basename(finalDestination));

      if (this.processImport) {
        try {
          await this.processImport(finalDestination, filePath);
        } catch (error) {
          console.error('Could not process the imported image:', finalDestination, error);
        }
      }

      // Emit event
      this.emit('image-added', path.basename(finalDestination));

      this.isProcessing.delete(filePath);
    } catch (error) {
      console.error('Error processing file:', error);
      this.isProcessing.delete(filePath);

      // 'image-detecting' was already sent, so the viewer is waiting for an
      // answer. A file taken away before it settled needs no message.
      this.emit('image-rejected', {
        filename: path.basename(filePath),
        message: error.message === 'File disappeared'
          ? null
          : `No se pudo importar la foto ${path.basename(filePath)}: ${error.message}`
      });
    }
  }

  /**
   * Move a file into imports, even from another drive
   *
   * A rename cannot cross volumes, and a project's ingest folder may be on a
   * different disk or a network share. If the copy succeeds but the original
   * cannot be deleted (a read-only share, a file the other program still
   * holds) the photo is already in imports, so that is only logged.
   *
   * @param {string} source
   * @param {string} destination
   */
  moveFile(source, destination) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      if (error.code !== 'EXDEV') {
        throw error;
      }
    }

    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    try {
      fs.unlinkSync(source);
    } catch (error) {
      console.error('Image copied to imports but the original could not be removed:', source, error);
    }
  }

  async waitForFileStability(filePath, timeout = 2000) {
    return new Promise((resolve, reject) => {
      let lastSize = -1;
      let stableCount = 0;
      const requiredStableCount = 2;

      // Both timers are cleared on every exit path and tracked on the instance,
      // so settling early does not leave the timeout pending and stopping the
      // watcher cancels whatever is still in flight
      const settle = (finishPromise, value) => {
        clearInterval(interval);
        clearTimeout(timeoutTimer);
        this.pendingTimers.delete(interval);
        this.pendingTimers.delete(timeoutTimer);
        finishPromise(value);
      };

      const interval = setInterval(() => {
        try {
          if (!fs.existsSync(filePath)) {
            settle(reject, new Error('File disappeared'));
            return;
          }

          const stats = fs.statSync(filePath);
          const currentSize = stats.size;

          if (currentSize === lastSize) {
            stableCount++;
            if (stableCount >= requiredStableCount) {
              settle(resolve);
            }
          } else {
            stableCount = 0;
            lastSize = currentSize;
          }
        } catch (error) {
          settle(reject, error);
        }
      }, 100);

      // Give up waiting and take the file as it is
      const timeoutTimer = setTimeout(() => settle(resolve), timeout);

      this.pendingTimers.add(interval);
      this.pendingTimers.add(timeoutTimer);
    });
  }

  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Stop watching and release the watcher
   *
   * Awaiting the close matters when another watcher is about to be created for
   * the same folder, as happens when a project is reopened.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.watcher) {
      const watcher = this.watcher;
      this.watcher = null;

      try {
        await watcher.close();
      } catch (error) {
        console.error('Error closing folder watcher:', error);
      }

      console.log('Folder watcher stopped');
    }

    // Cancel any stability check still waiting on a half-written file
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.pendingTimers.clear();

    this.isProcessing.clear();
    this.removeAllListeners();
  }
}

module.exports = FolderWatcher;
