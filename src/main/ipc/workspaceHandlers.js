// @ts-check
/**
 * Workspace Handlers - IPC surface of the Ver > Espacios de trabajo window
 *
 * The renderer lists the workspaces, applies one, saves the current view as
 * a new one and manages the user's. After every change the main process
 * rebuilds the menu, whose entries and Ctrl+1…9 follow the list, and tells
 * the window with 'workspaces-changed'.
 */

const { ipcMain } = require('electron');

/**
 * @param {import('./context').IpcContext} context - Shared context, built in main.js
 */
function registerWorkspaceHandlers(context) {
  const { workspaceStore, getCurrentView, applyWorkspace, refreshWorkspaces, logger } = context;

  // Every change goes through here: log it, and refresh the menu if it worked
  const change = (label, run) => async (...args) => {
    try {
      const result = await run(...args);
      if (result.success) {
        refreshWorkspaces();
      }
      return result;
    } catch (error) {
      logger.error(`[Workspaces] Could not ${label}:`, error);
      return { success: false, error: error.message };
    }
  };

  ipcMain.handle('get-workspaces', async () => {
    const currentView = getCurrentView();
    return {
      workspaces: workspaceStore.list(),
      activeId: workspaceStore.matching(currentView),
      currentView
    };
  });

  ipcMain.handle('apply-workspace', change('apply workspace', (event, id) => applyWorkspace(id)));

  ipcMain.handle('create-workspace', change('create workspace', (event, name) => {
    const result = workspaceStore.create(name, getCurrentView());
    if (result.success) logger.info(`[Workspaces] Created "${result.workspace.name}"`);
    return result;
  }));

  ipcMain.handle('overwrite-workspace', change('overwrite workspace', (event, id) =>
    workspaceStore.overwrite(id, getCurrentView())));

  ipcMain.handle('rename-workspace', change('rename workspace', (event, id, name) =>
    workspaceStore.rename(id, name)));

  ipcMain.handle('delete-workspace', change('delete workspace', (event, id) =>
    workspaceStore.remove(id)));

  ipcMain.handle('set-workspace-hidden', change('hide workspace', (event, id, hidden) =>
    workspaceStore.setHidden(id, hidden)));
}

module.exports = { registerWorkspaceHandlers };
