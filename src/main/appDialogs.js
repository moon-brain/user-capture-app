// @ts-check
/**
 * App dialogs - messages and questions from the main process, shown with the
 * app's own modals instead of the system's message boxes
 *
 * The main process has no DOM, so it asks the main window to show them: it
 * sends 'app-dialog' with an id, and the window answers on
 * 'app-dialog-response' with that id once the user closes the dialog. A
 * dialog the window can no longer answer (closed, or reloading) is settled
 * as if cancelled, so nothing waits forever.
 */

const { ipcMain } = require('electron');

// Answer of a question that was cancelled or could not be shown
const CANCELLED = -1;

let nextId = 1;
const pending = new Map();
let registered = false;

/**
 * Listen for the answers of the main window. Once per process.
 */
function registerAppDialogHandlers() {
  if (registered) return;
  registered = true;
  ipcMain.on('app-dialog-response', (event, { id, response } = {}) => {
    settle(id, response);
  });
}

/**
 * @private
 */
function settle(id, response) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  entry.cleanup();
  entry.resolve(response);
}

/**
 * @private
 */
function request(window, payload, fallback) {
  if (!window || window.isDestroyed()) {
    return Promise.resolve(fallback);
  }

  const id = nextId++;
  const { webContents } = window;

  return new Promise((resolve) => {
    const abandon = () => settle(id, fallback);
    pending.set(id, {
      resolve: (response) => resolve(response === undefined ? fallback : response),
      cleanup: () => {
        webContents.removeListener('destroyed', abandon);
        webContents.removeListener('did-start-loading', abandon);
      }
    });
    webContents.once('destroyed', abandon);
    // A reload wipes the dialog along with the page
    webContents.once('did-start-loading', abandon);
    webContents.send('app-dialog', { id, ...payload });
  });
}

/**
 * Tell the user something
 *
 * @param {import('electron').BrowserWindow|null} window - the main window
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.detail] - shown below the message
 * @returns {Promise<void>} settles when the user closes it
 */
function showAppMessage(window, { title, message, detail = '' }) {
  return request(window, { kind: 'message', title, message, detail }, undefined);
}

/**
 * Ask the user to choose
 *
 * @param {import('electron').BrowserWindow|null} window - the main window
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.detail]
 * @param {string[]} options.choices - the first one is the default (Enter)
 * @param {string} [options.cancel] - label of the button that answers CANCELLED
 * @returns {Promise<number>} index of the choice, or CANCELLED
 */
function askAppQuestion(window, { title, message, detail = '', choices, cancel = 'Cancelar' }) {
  return request(window, { kind: 'question', title, message, detail, choices, cancel }, CANCELLED);
}

module.exports = {
  registerAppDialogHandlers,
  showAppMessage,
  askAppQuestion,
  CANCELLED
};
