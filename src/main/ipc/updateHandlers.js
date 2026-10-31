// @ts-check
/**
 * Update Handlers - IPC surface of the update checker
 *
 * Thin layer over UpdateManager: the renderer asks for a manual check, skips a
 * version, opens a release page, downloads the new version and installs it.
 * Status updates, download progress included, travel the other way through the
 * 'update-status' event that UpdateManager sends on its own.
 */

const { ipcMain } = require('electron');

/**
 * @param {import('./context').IpcContext} context - Shared context, built in main.js
 */
function registerUpdateHandlers(context) {
  const { logger } = context;
  const manager = () => context.updateManager();

  // Manual check from the Help menu or the About dialog
  ipcMain.handle('check-for-updates', async () => {
    try {
      const updateManager = manager();
      if (!updateManager) {
        return { status: 'unsupported', manual: true };
      }
      return await updateManager.checkForUpdates({ manual: true });
    } catch (error) {
      logger.error('[Updates] Manual check failed:', error);
      return { status: 'error', manual: true, message: error.message };
    }
  });

  ipcMain.handle('skip-update-version', async (event, version) => {
    try {
      manager()?.skipVersion(version);
      return { success: true };
    } catch (error) {
      logger.error('[Updates] Could not skip version:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-release-page', async (event, version) => {
    try {
      await manager()?.openReleasePage(version);
      return { success: true };
    } catch (error) {
      logger.error('[Updates] Could not open release page:', error);
      return { success: false, error: error.message };
    }
  });

  // Settles when the download does; progress arrives through 'update-status'
  ipcMain.handle('download-update', async () => {
    try {
      const updateManager = manager();
      if (!updateManager) {
        return { status: 'unsupported' };
      }
      return await updateManager.downloadUpdate();
    } catch (error) {
      logger.error('[Updates] Download failed:', error);
      return { status: 'download-error', message: error.message };
    }
  });

  ipcMain.handle('install-update', async () => {
    try {
      const updateManager = manager();
      if (!updateManager) {
        return { success: false, error: 'Las actualizaciones no están disponibles.' };
      }
      return updateManager.installUpdate();
    } catch (error) {
      logger.error('[Updates] Install failed:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerUpdateHandlers };
