// @ts-check
/**
 * UpdateManager - checks GitHub Releases for a newer version of the app
 *
 * Wraps electron-updater's autoUpdater and is the only module that touches it.
 * It finds out whether a newer release exists and tells the renderer, which
 * offers to download it. The download starts only when the user asks for it,
 * reports its progress, and leaves the installer waiting until the user
 * restarts the app to install or simply closes it. Nothing is downloaded or
 * installed without being asked.
 *
 * Every dependency is injected so the manager can be tested with a fake
 * autoUpdater and without Electron.
 */

const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 15 * 1000;
// A safety net, not the usual path: electron-updater has its own HTTP timeouts
// and normally answers long before this. It exists because a check that never
// answers would leave `checking` set and silently disable every later check.
const DEFAULT_CHECK_TIMEOUT_MS = 60 * 1000;
const MAX_ERROR_LENGTH = 300;

/**
 * electron-updater errors carry the whole HTTP response (headers, the
 * releases feed...). One line is all the user or the log can use.
 * @param {Error|string} error
 * @returns {string}
 */
function shortMessage(error) {
  const raw = (typeof error === 'object' && error !== null && error.message) || String(error);
  const firstLine = raw.split(/\r?\n/)[0].trim();
  return firstLine.length > MAX_ERROR_LENGTH ? `${firstLine.slice(0, MAX_ERROR_LENGTH)}…` : firstLine;
}

class UpdateManager {
  /**
   * @param {Object} options
   * @param {Object} options.autoUpdater - electron-updater's autoUpdater (or a fake)
   * @param {boolean} options.isPackaged - app.isPackaged
   * @param {string} options.platform - process.platform
   * @param {Object} options.logger - application logger
   * @param {Function} options.loadPreferences - () => { autoCheck, lastCheck, skippedVersion }
   * @param {Function} options.savePreferences - (partial) => void
   * @param {Function} options.getMainWindow - () => BrowserWindow|null
   * @param {Function} options.openExternal - (url) => Promise
   * @param {string} options.releasesUrl - base URL of the GitHub releases page
   * @param {boolean} [options.forceDevConfig] - use dev-app-update.yml in development
   * @param {number} [options.checkIntervalMs] - minimum time between automatic checks
   * @param {number} [options.checkTimeoutMs] - how long to wait for an answer
   *   before giving the check up for lost
   */
  constructor(options) {
    this.autoUpdater = options.autoUpdater;
    this.isPackaged = options.isPackaged;
    this.platform = options.platform;
    this.logger = options.logger;
    this.loadPreferences = options.loadPreferences;
    this.savePreferences = options.savePreferences;
    this.getMainWindow = options.getMainWindow;
    this.openExternal = options.openExternal;
    this.releasesUrl = options.releasesUrl;
    this.forceDevConfig = options.forceDevConfig === true;
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.checkTimeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;

    this.checking = false;
    this.manual = false;
    this.pending = null;
    // Checks asked for while one was already running, answered with its outcome
    this.joined = [];
    this.startupTimer = null;
    this.timeoutTimer = null;
    this.initialized = false;

    // The version the last check found: the only one electron-updater can
    // download, since it downloads what that check returned
    this.availableVersion = null;
    this.downloading = false;
    this.downloadingVersion = null;
    this.lastProgress = null;
    this.downloadError = null;
    this.downloadedVersion = null;
    this.installing = false;
    this.installError = null;
  }

  /**
   * Whether updates can be checked at all in this process
   *
   * Only Windows installers are published, and electron-updater needs the
   * app-update.yml that only exists inside a packaged build.
   * @returns {boolean}
   */
  isSupported() {
    if (this.platform !== 'win32') return false;
    return this.isPackaged || this.forceDevConfig;
  }

  /**
   * Configure autoUpdater and subscribe to its events
   */
  init() {
    if (this.initialized || !this.isSupported()) return;

    const updater = this.autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    // Only full NSIS installers are published
    updater.disableWebInstaller = true;
    updater.logger = {
      info: (message) => this.logger.info(`[Updates] ${shortMessage(message)}`),
      warn: (message) => this.logger.warning(`[Updates] ${shortMessage(message)}`),
      error: (message) => this.logger.error(`[Updates] ${shortMessage(message)}`),
      debug: () => {}
    };
    if (this.forceDevConfig) {
      updater.forceDevUpdateConfig = true;
    }

    updater.on('checking-for-update', () => {
      this._send({ status: 'checking', manual: this.manual });
    });

    updater.on('update-available', (info) => {
      const version = info.version;
      this.availableVersion = version;
      const preferences = this.loadPreferences();
      this.savePreferences({ lastCheck: new Date().toISOString() });
      this.logger.info(`[Updates] Version ${version} available`);

      if (!this.manual && preferences.skippedVersion === version) {
        this.logger.info(`[Updates] Version ${version} was skipped by the user`);
        this._resolve({ status: 'skipped-version', version });
        return;
      }

      const payload = {
        status: 'available',
        manual: this.manual,
        version,
        releaseDate: info.releaseDate || null,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
        releaseUrl: this.releaseUrlFor(version)
      };
      this._send(payload);
      this._resolve(payload);
    });

    updater.on('update-not-available', (info) => {
      this.availableVersion = null;
      this.savePreferences({ lastCheck: new Date().toISOString() });
      this.logger.info(`[Updates] No update available (latest is ${info?.version})`);
      const payload = { status: 'not-available', manual: this.manual, version: info?.version };
      if (this.manual) this._send(payload);
      this._resolve(payload);
    });

    updater.on('download-progress', (progress) => {
      if (!this.downloading) return;
      this.lastProgress = this._progressPayload(progress);
      this._send(this.lastProgress);
    });

    updater.on('update-downloaded', (info) => {
      this._downloadFinished(info?.version || this.downloadingVersion);
    });

    updater.on('error', (error) => {
      const message = shortMessage(error);
      // The same event reports failed checks, downloads and installs. They
      // never overlap: no check runs while a download is under way.
      if (this.installing) {
        this._installFailed(message);
        return;
      }
      if (this.downloading) {
        this._downloadFailed(message);
        return;
      }
      // An automatic check that fails must stay silent: school networks may
      // block GitHub, and that is not something to show at every startup
      if (this.manual) {
        this.logger.error(`[Updates] Check failed: ${message}`);
        this._send({ status: 'error', manual: true, message });
      } else {
        this.logger.warning(`[Updates] Automatic check failed: ${message}`);
      }
      this._resolve({ status: 'error', manual: this.manual, message });
    });

    this.initialized = true;
  }

  /**
   * Check whether a newer release exists
   *
   * @param {Object} [options]
   * @param {boolean} [options.manual] - started by the user, so every outcome is shown
   * @returns {Promise<Object>} outcome: { status, ... }
   */
  checkForUpdates({ manual = false } = {}) {
    if (!this.isSupported()) {
      return Promise.resolve({ status: 'unsupported', manual });
    }
    // Once the user has asked for a download, a check could only offer the
    // same version again: show how far the download has got instead
    if (this.downloading || this.downloadedVersion) {
      const payload = this.downloading
        ? this.lastProgress
        : { status: 'downloaded', version: this.downloadedVersion };
      if (manual) this._send(payload);
      return Promise.resolve({ ...payload, manual });
    }
    if (this.checking) {
      // A manual check while another runs, typically the automatic one at
      // startup: join it rather than bail out. It becomes manual so its
      // outcome is shown; answering 'already-checking' left the update window
      // on "Buscando actualizaciones" with nothing to close it.
      if (manual) {
        this.manual = true;
      }
      return new Promise((resolve) => this.joined.push(resolve));
    }

    this.init();
    this.checking = true;
    this.manual = manual;

    return new Promise((resolve) => {
      this.pending = resolve;
      this.timeoutTimer = setTimeout(() => this._giveUp(), this.checkTimeoutMs);

      Promise.resolve()
        .then(() => this.autoUpdater.checkForUpdates())
        .catch((error) => {
          // The 'error' event usually fires too, but not for every failure
          this._resolve({ status: 'error', manual, message: shortMessage(error) });
        });
    });
  }

  /**
   * Download the version the last check found
   *
   * Progress and the outcome reach the renderer as 'update-status' events;
   * the returned promise settles when the download does. electron-updater
   * downloads only the blocks that changed when it has the installer of the
   * running version (the NSIS installer leaves a copy for this) and the
   * release publishes its .blockmap; otherwise it falls back to the whole
   * installer on its own.
   * @returns {Promise<Object>} outcome: { status, version, ... }
   */
  downloadUpdate() {
    if (!this.isSupported()) {
      return Promise.resolve({ status: 'unsupported' });
    }
    if (this.downloadedVersion) {
      const payload = { status: 'downloaded', version: this.downloadedVersion };
      this._send(payload);
      return Promise.resolve(payload);
    }
    if (this.downloading) {
      return Promise.resolve(this.lastProgress);
    }
    if (!this.availableVersion) {
      const payload = {
        status: 'download-error',
        version: null,
        message: 'No hay ninguna versión nueva que descargar. Vuelve a buscar actualizaciones.'
      };
      this._send(payload);
      return Promise.resolve(payload);
    }

    this.downloading = true;
    this.downloadingVersion = this.availableVersion;
    this.downloadError = null;
    this.lastProgress = this._progressPayload();
    // electron-updater registers its install-on-quit handler when a download
    // finishes, and only if this is already set by then: turning it on later
    // does nothing. Both choices offered once the download is done end in
    // installing, so from here on closing the app installs the update.
    this.autoUpdater.autoInstallOnAppQuit = true;
    this.logger.info(`[Updates] Downloading version ${this.downloadingVersion}`);
    this._send(this.lastProgress);

    return Promise.resolve()
      .then(() => this.autoUpdater.downloadUpdate())
      .then(() => {
        // 'update-downloaded' has normally been handled already
        this._downloadFinished(this.downloadingVersion);
        return { status: 'downloaded', version: this.downloadedVersion };
      })
      .catch((error) => this._downloadFailed(shortMessage(error)));
  }

  /**
   * Quit, run the downloaded installer and start the app again
   *
   * The renderer closes the project first. The installer runs silently: the
   * user already chose to install, and the wizard would only ask again.
   * @returns {{success: boolean, error?: string}} on success the app is
   *   already quitting, so the answer may never reach the renderer
   */
  installUpdate() {
    if (!this.downloadedVersion) {
      return { success: false, error: 'No hay ninguna actualización descargada.' };
    }

    this.installing = true;
    this.installError = null;
    this.logger.info(`[Updates] Installing version ${this.downloadedVersion} and restarting`);
    this.dispose();
    this.autoUpdater.quitAndInstall(true, true);

    // An installer that cannot start is reported, synchronously, through
    // the 'error' event
    return this.installing
      ? { success: true }
      : { success: false, error: this.installError };
  }

  /**
   * Run the automatic startup check, if it is due
   *
   * @param {number} [delayMs] - wait so the check does not compete with the
   *   project opening and the repository sync
   * @returns {boolean} whether a check was scheduled
   */
  scheduleStartupCheck(delayMs = DEFAULT_STARTUP_DELAY_MS) {
    if (!this.isSupported()) return false;

    const preferences = this.loadPreferences();
    if (preferences.autoCheck === false) {
      this.logger.info('[Updates] Automatic check disabled in preferences');
      return false;
    }
    if (!this.isCheckDue(preferences.lastCheck)) {
      this.logger.info(`[Updates] Last check was at ${preferences.lastCheck}, not due yet`);
      return false;
    }

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      this.checkForUpdates({ manual: false });
    }, delayMs);
    return true;
  }

  /**
   * @param {string|null} lastCheck - ISO date of the last completed check
   * @returns {boolean}
   */
  isCheckDue(lastCheck) {
    if (!lastCheck) return true;
    const elapsed = Date.now() - new Date(lastCheck).getTime();
    return Number.isNaN(elapsed) || elapsed >= this.checkIntervalMs;
  }

  /**
   * Stop asking about a version until a different one comes out
   * @param {string} version
   */
  skipVersion(version) {
    this.savePreferences({ skippedVersion: version });
    this.logger.info(`[Updates] Version ${version} will not be offered again`);
  }

  /**
   * @param {string} version
   * @returns {string} URL of that version's GitHub release
   */
  releaseUrlFor(version) {
    return `${this.releasesUrl}/tag/v${version}`;
  }

  /**
   * Open a release page in the default browser
   * @param {string} version
   */
  openReleasePage(version) {
    return this.openExternal(this.releaseUrlFor(version));
  }

  /**
   * Cancel a pending startup check (on shutdown)
   */
  dispose() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Abandon a check that never answered
   *
   * Without this the check would stay open for the rest of the session and
   * every later one, including the manual one from the menu, would bail out
   * with 'already-checking' and look like a menu entry that does nothing.
   * @private
   */
  _giveUp() {
    this.timeoutTimer = null;
    const message = 'La comprobación de actualizaciones ha tardado demasiado.';
    this.logger.warning(`[Updates] Check gave no answer in ${this.checkTimeoutMs} ms`);

    // Same rule as any other failure: an automatic check stays quiet
    if (this.manual) {
      this._send({ status: 'error', manual: true, message });
    }

    this._resolve({ status: 'error', manual: this.manual, message, timedOut: true });
  }

  /**
   * @private
   */
  _progressPayload(progress = {}) {
    return {
      status: 'downloading',
      version: this.downloadingVersion,
      percent: Number(progress.percent) || 0,
      transferred: progress.transferred || 0,
      total: progress.total || 0,
      bytesPerSecond: progress.bytesPerSecond || 0
    };
  }

  /**
   * Reached from both the 'update-downloaded' event and the download promise
   * @private
   */
  _downloadFinished(version) {
    if (!this.downloading) return;

    this.downloading = false;
    this.downloadedVersion = version;
    this.lastProgress = null;
    this.logger.info(`[Updates] Version ${version} downloaded, ready to install`);
    this._send({ status: 'downloaded', version });
  }

  /**
   * Reached from both the 'error' event and the download promise, so the
   * failure is reported once and both get the same answer
   * @private
   */
  _downloadFailed(message) {
    if (this.downloading) {
      const version = this.downloadingVersion;
      this.downloading = false;
      this.lastProgress = null;
      this.autoUpdater.autoInstallOnAppQuit = false;
      this.downloadError = { status: 'download-error', version, message };
      this.logger.error(`[Updates] Download of version ${version} failed: ${message}`);
      this._send(this.downloadError);
    }
    return this.downloadError;
  }

  /**
   * @private
   */
  _installFailed(message) {
    this.installing = false;
    this.installError = message;
    this.logger.error(`[Updates] Could not start the installer: ${message}`);
    this._send({ status: 'install-error', version: this.downloadedVersion, message });
  }

  /**
   * Push a status to the renderer
   * @private
   */
  _send(payload) {
    const window = this.getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('update-status', payload);
    }
  }

  /**
   * Finish the current check
   * @private
   */
  _resolve(outcome) {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    this.checking = false;
    const resolve = this.pending;
    const joined = this.joined;
    this.pending = null;
    this.joined = [];
    if (resolve) resolve(outcome);
    joined.forEach(join => join(outcome));
  }
}

module.exports = Object.assign(UpdateManager, {
  DEFAULT_CHECK_INTERVAL_MS,
  DEFAULT_STARTUP_DELAY_MS,
  DEFAULT_CHECK_TIMEOUT_MS,
  shortMessage
});
