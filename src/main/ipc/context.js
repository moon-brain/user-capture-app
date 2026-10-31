// @ts-check
/**
 * The context every IPC handler module receives
 *
 * main.js builds one object and passes it to every register...Handlers(). It
 * is described once here, instead of in each module, so that `npm run
 * typecheck` checks that what main.js provides is what the handlers use.
 *
 * Windows and services that can be created, closed or replaced while the
 * application runs are passed as getters: a handler asks for the current one
 * when it runs, and must expect null.
 *
 * This file has no code; it only holds the type.
 *
 * @typedef {Object} IpcContext
 * @property {() => import('electron').BrowserWindow | null} mainWindow
 * @property {Object} logger
 * @property {Object} state - shared application state (project path, database, watchers...)
 * @property {Object} repositoryCacheManager
 * @property {() => Object | null} repositoryMirror - the repository mirror, null until it has started
 * @property {() => import('electron').BrowserWindow | null} imageGridWindow
 * @property {() => import('electron').BrowserWindow | null} groupCoverageWindow
 * @property {() => import('electron').BrowserWindow | null} repositoryGridWindow
 * @property {Function} createMenu - rebuilds the application menu
 * @property {Function} addRecentProject - adds a project to the recent list
 * @property {Function} updateWindowTitle
 * @property {Function} ensureDeletedGroup
 * @property {Function} ensureRepositoryMirrorStarted
 * @property {Function} reinitializeRepositoryMirror
 * @property {Function} closeCurrentProject
 * @property {() => Object | null} updateManager - the UpdateManager
 * @property {Function} openHelpWindow - opens the help window at a page
 * @property {Object} workspaceStore - the WorkspaceStore
 * @property {() => Object | null} receiptPrinter
 * @property {() => Object | null} thumbnailService
 * @property {() => Object} getCurrentView - the current display preferences
 * @property {(id: string) => Promise<{success: boolean, error?: string}>} applyWorkspace
 * @property {() => void} refreshWorkspaces - refreshes the menu and the window
 * @property {(enabled: boolean) => void} onOrlaServiceChanged
 */

module.exports = {};
