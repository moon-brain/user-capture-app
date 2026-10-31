// @ts-check
/**
 * User manual IPC handlers
 */
const { ipcMain, shell } = require('electron');
const { loadManifest, renderPage, searchPages } = require('../helpContent');

/**
 * Register the handlers the help window uses
 * @param {import('./context').IpcContext} context - Shared context, built in main.js
 */
function registerHelpHandlers(context) {
  const { logger, openHelpWindow } = context;

  ipcMain.handle('help-get-pages', async () => {
    try {
      return { success: true, pages: loadManifest() };
    } catch (error) {
      logger.error('Error reading the help index', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('help-get-page', async (event, pageId) => {
    try {
      return { success: true, page: renderPage(pageId) };
    } catch (error) {
      logger.error(`Error reading help page ${pageId}`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('help-search', async (event, query) => {
    try {
      return { success: true, results: searchPages(String(query || '')) };
    } catch (error) {
      logger.error('Error searching the help', error);
      return { success: false, error: error.message };
    }
  });

  // Links in the manual may point to the web; they open in the browser, never
  // inside the help window
  ipcMain.handle('help-open-external', async (event, url) => {
    if (!/^https?:\/\//i.test(String(url))) {
      return { success: false, error: 'Solo se pueden abrir enlaces web' };
    }
    await shell.openExternal(url);
    return { success: true };
  });

  // Any window can open the manual at a given page, for contextual help
  ipcMain.handle('open-help', async (event, target = {}) => {
    openHelpWindow(target);
    return { success: true };
  });
}

module.exports = { registerHelpHandlers };
