// @ts-check
const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Printed Cards Window Manager
 */
class PrintedCardsWindowManager {
  constructor() {
    this.window = null;
  }

  /**
   * Create the printed cards window
   * @param {Object} [options] - Window creation options
   * @param {boolean} [options.isDev] - Whether running in development mode
   * @returns {import('electron').BrowserWindow} The created window
   */
  create(options = {}) {
    const { isDev = false } = options;

    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Últimos Carnets Impresos',
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

    this.window.loadFile('src/renderer/printed-cards.html');

    this.window.once('ready-to-show', () => {
      this.window.setMenuBarVisibility(false);
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
   * Open the printed cards window (create if doesn't exist)
   * @param {Object} [options] - Window creation options
   * @returns {import('electron').BrowserWindow} The window instance
   */
  open(options = {}) {
    if (!this.window) {
      this.create(options);
    } else {
      this.window.show();
      this.window.focus();
    }
    return this.window;
  }

  /**
   * Close the printed cards window
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

module.exports = PrintedCardsWindowManager;
