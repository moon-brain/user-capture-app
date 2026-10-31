// @ts-check
const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Help Window Manager
 *
 * Shows the user manual. Opening it again while it is open only moves it to
 * the requested page.
 */
class HelpWindowManager {
  constructor() {
    this.window = null;
  }

  /**
   * Create the help window
   * @param {Object} [options] - Window creation options
   * @param {boolean} [options.isDev] - Whether running in development mode
   * @param {{page?: string, anchor?: string}} [options.target] - Page to open at
   * @returns {import('electron').BrowserWindow} The created window
   */
  create(options = {}) {
    const { isDev = false, target = {} } = options;

    this.window = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 700,
      minHeight: 500,
      title: 'Manual de uso',
      icon: path.join(__dirname, '../../../assets/icons/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '../../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      backgroundColor: '#1a1f2e',
      show: false,
      autoHideMenuBar: true
    });

    // The manual never leaves its own page: internal links are handled by the
    // viewer and web links are opened in the browser by the main process
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());

    const query = {};
    if (target.page) query.page = target.page;
    if (target.anchor) query.anchor = target.anchor;
    this.window.loadFile('src/renderer/help.html', { query });

    this.window.once('ready-to-show', () => {
      this.window.setMenuBarVisibility(false);
      this.window.show();
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    if (isDev) {
      this.window.webContents.openDevTools();
    }

    return this.window;
  }

  /**
   * Open the help window at a page (create if it doesn't exist)
   * @param {Object} [options] - Window creation options
   * @returns {import('electron').BrowserWindow} The window instance
   */
  open(options = {}) {
    if (!this.window) {
      this.create(options);
    } else {
      if (options.target && options.target.page) {
        this.window.webContents.send('help-navigate', options.target);
      }
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
    }
    return this.window;
  }

  /**
   * Close the help window
   *
   * Guards against an already destroyed window: the 'closed' handler clears the
   * reference, but a caller can still reach this with a stale one.
   */
  close() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
  }

  /**
   * Get the window instance
   * @returns {import('electron').BrowserWindow|null}
   */
  getWindow() {
    return this.window;
  }

  /**
   * Check if window exists and is not destroyed
   * @returns {boolean}
   */
  isValid() {
    return this.window && !this.window.isDestroyed();
  }
}

module.exports = HelpWindowManager;
