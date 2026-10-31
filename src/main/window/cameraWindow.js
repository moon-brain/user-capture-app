// @ts-check
const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Camera Window Manager
 */
class CameraWindowManager {
  constructor() {
    this.window = null;
  }

  /**
   * Create the camera window
   * @param {Object} [options] - Window creation options
   * @param {boolean} [options.isDev] - Whether running in development mode
   * @param {Function} [options.onClosed] - Called once the window has closed,
   *   however it was closed
   * @returns {import('electron').BrowserWindow} The created window
   */
  create(options = {}) {
    const { isDev = false, onClosed = null } = options;

    this.window = new BrowserWindow({
      width: 800,
      height: 600,
      title: 'Vista de Cámara',
      icon: path.join(__dirname, '../../../assets/icons/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '../../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // Chromium throttles timers and animation frames in background windows,
        // which stalls the live preview. The whole point of this window is to
        // stay usable while the user works in the main one.
        backgroundThrottling: false
      },
      backgroundColor: '#1a1f2e',
      show: false,
      autoHideMenuBar: true
    });

    this.window.loadFile('src/renderer/camera.html');

    this.window.once('ready-to-show', () => {
      this.window.setMenuBarVisibility(false);
      this.window.show();
    });

    this.window.on('closed', () => {
      this.window = null;
      if (onClosed) onClosed();
    });

    // Open DevTools in development
    if (isDev) {
      this.window.webContents.openDevTools();
    }

    return this.window;
  }

  /**
   * Open the camera window (create if doesn't exist)
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
   * Close the camera window
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
   * Get the camera window instance
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

  /**
   * Show the window if it exists
   */
  show() {
    if (this.window) {
      this.window.show();
      this.window.focus();
    }
  }
}

module.exports = CameraWindowManager;