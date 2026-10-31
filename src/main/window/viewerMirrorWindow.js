// @ts-check
const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Viewer Mirror Window Manager
 *
 * Ver > Visor en ventana aparte: a window that shows the same photo as the
 * main window's viewer, meant to be dragged to a second monitor. It has no
 * controls of its own; the main window's renderer reports every change of
 * photo and this manager passes it on.
 */
class ViewerMirrorWindowManager {
  constructor() {
    this.window = null;
    // What the viewer shows: { path, url }, or null when it shows nothing.
    // Kept here so a window opened later, or reloaded, starts on it
    this.image = null;
  }

  /**
   * Create the mirror window
   * @param {Object} [options] - Window creation options
   * @param {boolean} [options.isDev] - Whether running in development mode
   * @param {Object} [options.bounds] - Content area it was last left with,
   *   already checked to fall on a connected display
   * @param {boolean} [options.fullScreen] - Whether it was left full screen
   * @param {Function} [options.onPlacementChange] - Receives { bounds, fullScreen }
   *   when the window closes, to open it there next time
   * @returns {import('electron').BrowserWindow} The created window
   */
  create(options = {}) {
    const { isDev = false, bounds = null, fullScreen = false, onPlacementChange = null } = options;

    this.window = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Visor',
      icon: path.join(__dirname, '../../../assets/icons/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '../../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      backgroundColor: '#000000',
      show: false
    });

    const win = this.window;
    // Nothing but the photo. Hiding the menu bar later, once placed, changed
    // the content area and the window grew every time it was opened
    win.removeMenu();
    // The content area, not the whole window: with fractional display
    // scaling the window's bounds do not survive a round trip, and it grew a
    // pixel every time it was opened
    if (bounds) {
      win.setContentBounds(bounds);
    }
    win.loadFile('src/renderer/viewer-mirror.html');

    win.once('ready-to-show', () => {
      if (fullScreen) {
        win.setFullScreen(true);
      }
      win.show();
    });

    // The last content area it had as a normal window. Full screen or
    // maximised is not where it goes back to, but it tells the monitor: it is
    // dragged there first, and that move is what gets remembered
    let lastBounds = bounds;
    const trackBounds = () => {
      if (!win.isDestroyed() && !win.isFullScreen() && !win.isMaximized() && !win.isMinimized()) {
        lastBounds = win.getContentBounds();
      }
    };
    win.once('ready-to-show', trackBounds);
    win.on('moved', trackBounds);
    win.on('resized', trackBounds);

    // Saved on 'close', while the window can still be asked
    win.on('close', () => {
      if (onPlacementChange && !win.isDestroyed()) {
        trackBounds();
        onPlacementChange({ bounds: lastBounds, fullScreen: win.isFullScreen() });
      }
    });

    win.on('closed', () => {
      if (this.window === win) {
        this.window = null;
      }
    });

    // Open DevTools in development
    if (isDev) {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    return win;
  }

  /**
   * Whether saved bounds still fall on a connected display. The second
   * monitor it was left on may be unplugged, and a window opened there would
   * be out of reach; a good part of its title bar has to be on some display
   * @param {Object} bounds - Content area, { x, y, width, height }
   * @param {Array<{ workArea: Object }>} displays - screen.getAllDisplays()
   * @returns {boolean}
   */
  static isOnScreen(bounds, displays) {
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
      return false;
    }
    const TITLE_BAR = 32;
    const MIN_VISIBLE = 100;
    return (displays || []).some(({ workArea: area }) => {
      const width = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
      const top = bounds.y >= area.y && bounds.y + TITLE_BAR <= area.y + area.height;
      return top && width >= Math.min(MIN_VISIBLE, bounds.width);
    });
  }

  /**
   * Open the mirror window (create if doesn't exist)
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
   * Take the menu off again. On Windows, Menu.setApplicationMenu() puts the
   * application menu on every window, this one included, and main.js rebuilds
   * it often (workspaces, cameras, Ver options): the bar came back and showed
   * up at the next repaint, such as after maximising and restoring
   */
  removeMenu() {
    if (this.isValid()) {
      this.window.removeMenu();
    }
  }

  /**
   * The viewer changed photo
   * @param {{ path: string, url: string }|null} image
   */
  setImage(image) {
    this.image = image && image.path && image.url ? { path: image.path, url: image.url } : null;
    if (this.isValid()) {
      this.window.webContents.send('viewer-mirror-image', this.image);
    }
  }

  /**
   * @returns {{ path: string, url: string }|null} What the viewer shows
   */
  getImage() {
    return this.image;
  }

  /**
   * Close the mirror window
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
    return Boolean(this.window && !this.window.isDestroyed());
  }
}

module.exports = ViewerMirrorWindowManager;
