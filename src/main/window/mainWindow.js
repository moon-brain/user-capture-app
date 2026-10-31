// @ts-check
const { BrowserWindow } = require('electron');
const path = require('path');
const VersionManager = require('../utils/version');

/**
 * Main Window Manager
 */
class MainWindowManager {
  constructor() {
    this.window = null;
  }

  /**
   * Application version, resolved on first use
   *
   * This manager is constructed while the module loads, before Electron is
   * ready, and resolving the version can shell out to git. VersionManager
   * memoises the result, so reading this repeatedly costs nothing.
   *
   * @returns {string}
   */
  get version() {
    return VersionManager.getVersion();
  }

  /**
   * Create the main window
   * @param {Object} [options] - Window creation options
   * @param {boolean} [options.isDev] - Whether running in development mode
   * @returns {import('electron').BrowserWindow} The created window
   */
  create(options = {}) {
    const { isDev = false } = options;

    this.window = new BrowserWindow({
      width: 1400,
      height: 900,
      title: `Edu User Capture v${this.version}`,
      icon: path.join(__dirname, '../../../assets/icons/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '../../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      backgroundColor: '#1a1f2e',
      show: false
    });

    this.window.loadFile('src/renderer/index.html');

    this.window.once('ready-to-show', () => {
      this.window.show();
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    // Open DevTools in development
    if (isDev) {
      this.window.webContents.openDevTools();
    }

    return this.window;
  }

  /**
   * Get the main window instance
   *
   * Returns null once the window is gone, so the callers' `if (mainWindow)`
   * checks are enough to keep them from sending to a destroyed window.
   *
   * @returns {import('electron').BrowserWindow|null}
   */
  getWindow() {
    if (this.window && this.window.isDestroyed()) {
      this.window = null;
    }

    return this.window;
  }

  /**
   * Update window title with project name
   * @param {string|null} projectPath - Path to the project folder
   */
  updateTitle(projectPath) {
    if (!this.window) return;

    if (projectPath) {
      const projectName = path.basename(projectPath);
      this.window.setTitle(`Edu User Capture v${this.version} - ${projectName}`);
    } else {
      this.window.setTitle(`Edu User Capture v${this.version}`);
    }
  }

  /**
   * Send initial display preferences to the window
   * @param {Object} preferences - Display preferences
   */
  sendInitialPreferences(preferences) {
    if (!this.window) return;

    this.window.webContents.send('initial-display-preferences', preferences);
  }

  /**
   * Focus the main window
   */
  focus() {
    if (this.window) {
      this.window.focus();
    }
  }

  /**
   * Check if window exists and is not destroyed
   * @returns {boolean}
   */
  isValid() {
    return this.window && !this.window.isDestroyed();
  }
}

module.exports = MainWindowManager;