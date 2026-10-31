// @ts-check
// Must be set before anything touches the thread pool, so it goes above every
// require. Node defaults to four threads, and every file read and every
// thumbnail sharp encodes queues on them: scrolling a long list asks for dozens
// of photos at once and they end up waiting behind each other.
if (!process.env.UV_THREADPOOL_SIZE) {
  const cores = require('os').cpus().length;
  process.env.UV_THREADPOOL_SIZE = String(Math.min(Math.max(cores, 8), 32));
}

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./src/main/database');
const {
  startIngestWatcher,
  configureIngestFolder,
  getActiveIngestPath,
  setIncomingRotation
} = require('./src/main/ingestFolder');
const ImageManager = require('./src/main/imageManager');
const RepositoryMirror = require('./src/main/repositoryMirror');
const MenuBuilder = require('./src/main/menu/menuBuilder');
const MainWindowManager = require('./src/main/window/mainWindow');
const CameraWindowManager = require('./src/main/window/cameraWindow');
const ImageGridWindowManager = require('./src/main/window/imageGridWindow');
const RepositoryGridWindowManager = require('./src/main/window/repositoryGridWindow');
const PrintedCardsWindowManager = require('./src/main/window/printedCardsWindow');
const GroupCoverageWindowManager = require('./src/main/window/groupCoverageWindow');
const HelpWindowManager = require('./src/main/window/helpWindow');
const ViewerMirrorWindowManager = require('./src/main/window/viewerMirrorWindow');
const { getLogger } = require('./src/main/logger');
const {
  loadGlobalConfig,
  saveGlobalConfig,
  getImageRepositoryPath,
  setImageRepositoryPath,
  saveDisplayPreferences,
  getUpdatePreferences,
  saveUpdatePreferences,
  isOrlaServiceEnabled,
  getReplacedArchiveNotice,
  saveReplacedArchiveNotice,
  getWorkspaceSettings,
  saveWorkspaceSettings
} = require('./src/main/utils/config');
const { WorkspaceStore, VIEW_KEYS } = require('./src/main/workspaces');
const { ReceiptPrinter } = require('./src/main/receiptPrinter');
const UpdateManager = require('./src/main/updateManager');
const {
  loadRecentProjects: loadRecentProjectsUtil,
  saveRecentProjects: saveRecentProjectsUtil,
  addRecentProject: addRecentProjectUtil
} = require('./src/main/utils/recentProjects');
const { RepositoryCacheManager } = require('./src/main/utils/repositoryCache');
const ThumbnailService = require('./src/main/thumbnailService');
const {
  registerImageProtocolScheme,
  registerImageProtocol
} = require('./src/main/protocol/imageProtocol');

// Has to run before the app is ready, so it cannot wait for whenReady below
registerImageProtocolScheme();

// IPC handler modules
const { registerProjectHandlers } = require('./src/main/ipc/projectHandlers');
const { registerUserGroupImageHandlers } = require('./src/main/ipc/userGroupImageHandlers');
const { registerExportHandlers } = require('./src/main/ipc/exportHandlers');
const { registerMiscHandlers } = require('./src/main/ipc/miscHandlers');
const { registerUpdateHandlers } = require('./src/main/ipc/updateHandlers');
const { registerHelpHandlers } = require('./src/main/ipc/helpHandlers');
const { registerAppDialogHandlers, showAppMessage, askAppQuestion } = require('./src/main/appDialogs');
const { scanReplacedArchive, shouldNoticeArchive } = require('./src/main/replacedArchive');
const { publishProjectXml } = require('./src/main/sharedXml');
const { registerWorkspaceHandlers } = require('./src/main/ipc/workspaceHandlers');

// Enable hot reload in development
if (process.argv.includes('--dev')) {
  try {
    // Its types expect Node's full Module; CommonJS JS only types module.exports
    require('electron-reloader')(/** @type {any} */ (module), {
      debug: true,
      watchRenderer: true
    });
  } catch (err) {
    console.log('Error loading electron-reloader:', err);
  }
}

// Application state
// Window managers
const mainWindowManager = new MainWindowManager();
const cameraWindowManager = new CameraWindowManager();
const imageGridWindowManager = new ImageGridWindowManager();
const repositoryGridWindowManager = new RepositoryGridWindowManager();
const printedCardsWindowManager = new PrintedCardsWindowManager();
const groupCoverageWindowManager = new GroupCoverageWindowManager();
const helpWindowManager = new HelpWindowManager();
const viewerMirrorWindowManager = new ViewerMirrorWindowManager();

// Every window other than the main one. Register new secondary windows here:
// closing the main window closes everything in this list, and any window left
// out of it keeps 'window-all-closed' from firing, so the application would
// never quit.
const secondaryWindowManagers = [
  cameraWindowManager,
  imageGridWindowManager,
  repositoryGridWindowManager,
  printedCardsWindowManager,
  groupCoverageWindowManager,
  helpWindowManager,
  viewerMirrorWindowManager
];

let dbManager;
let folderWatcher;
let imageManager;
let projectPath = null;
let logger = getLogger();
let cameraEnabled = false;
let cameraAutoStart = false;
let recentProjects = [];
// Display preferences - will be loaded from config on startup
let showDuplicatesOnly = false;
let showCardPrintRequestsOnly = false;
let showPublicationRequestsOnly = false;
let showCapturedPhotos = true;
let showRepositoryPhotos = false;
let showRepositoryIndicators = false;
let showAdditionalActions = true;
// Preferencias > Orla de graduación. Off, it hides what Ver > Pagos de la orla
// would show, whatever that option says
let orlaEnabled = true;
let showCaptureHistory = false;
// Most recently linked photos first instead of alphabetical order
let sortByLinkDate = false;
// Thumbnails of every user instead of the table, of the captured photos or of
// the repository ones
let showThumbnailGrid = false;
let thumbnailGridSource = 'captured';
let availableCameras = [];
let selectedCameraId = null;
let repositoryMirror = null; // Repository mirror manager
let menuBuilder = null; // Menu builder instance
let updateManager = null; // Checks GitHub Releases for newer versions

// Repository cache manager
const repositoryCacheManager = new RepositoryCacheManager();

// Ver > Espacios de trabajo
const workspaceStore = new WorkspaceStore({ load: getWorkspaceSettings, save: saveWorkspaceSettings });

// Prints the orla receipts with the Windows text engine. Installed next to
// the app's resources; in development, built into build/ by
// scripts/build-receipt-printer.mjs
const receiptPrinter = new ReceiptPrinter({
  exePath: app.isPackaged
    ? path.join(process.resourcesPath, 'receipt-printer', 'ReceiptPrinter.exe')
    : path.join(__dirname, 'build', 'receipt-printer', 'ReceiptPrinter.exe'),
  logger
});

// Application state shared with the IPC handlers and the ingest folder module
const sharedState = {
  get dbManager() { return dbManager; },
  set dbManager(value) { dbManager = value; },
  get folderWatcher() { return folderWatcher; },
  set folderWatcher(value) { folderWatcher = value; },
  get imageManager() { return imageManager; },
  set imageManager(value) { imageManager = value; },
  get projectPath() { return projectPath; },
  set projectPath(value) { projectPath = value; },
  get availableCameras() { return availableCameras; },
  set availableCameras(value) { availableCameras = value; },
  get selectedCameraId() { return selectedCameraId; },
  set selectedCameraId(value) { selectedCameraId = value; },
  // Proyecto > Girar las fotos entrantes, loaded with the project
  incomingRotation: 0,
  // Webcam captures waiting to reach imports, kept off the automatic rotation
  webcamCaptures: new Set(),
  invalidateRepositoryCache: () => repositoryCacheManager.invalidateCache()
};

// What the ingest folder module needs to start the watcher and ask the user
function getIngestContext() {
  return {
    state: sharedState,
    logger,
    getMainWindow: () => mainWindowManager.getWindow(),
    mirrorPath: repositoryMirror ? repositoryMirror.mirrorPath : null
  };
}

// Thumbnail cache, created lazily so app.getPath is only used once ready
let thumbnailService = null;

// Repository folder of the open project, cached for the image protocol
let currentRepositoryPath = null;

/**
 * Folders the image protocol is allowed to read from
 *
 * Everything the interface shows lives in the project's imports folder, the
 * local mirror, or the configured repository. Anything else is refused.
 */
function getImageRoots() {
  const roots = [];

  if (projectPath) {
    roots.push(path.join(projectPath, 'imports'));
    roots.push(getActiveIngestPath(sharedState));
  }

  if (repositoryMirror) {
    roots.push(repositoryMirror.mirrorPath);
    roots.push(repositoryMirror.repositoryPath);
  }

  if (currentRepositoryPath) {
    roots.push(currentRepositoryPath);
  }

  return roots;
}

/**
 * Persist every display preference
 *
 * Each toggle saves the whole set, so this reads the current state instead of
 * taking a snapshot per call site: a preference missing from one of them would
 * be silently reset the next time that other toggle was used.
 */
function persistDisplayPreferences() {
  saveDisplayPreferences({
    showDuplicatesOnly,
    showCardPrintRequestsOnly,
    showPublicationRequestsOnly,
    showCapturedPhotos,
    showRepositoryPhotos,
    showRepositoryIndicators,
    showAdditionalActions,
    showCaptureHistory,
    showThumbnailGrid,
    sortByLinkDate
  });
}

// ============================================================================
// Display options of the Ver menu
// ============================================================================
// Each one is switched from its own menu entry or, all at once, by a
// workspace. The renderer is told about each change on its own channel.

function setShowCapturedPhotos(checked) {
  showCapturedPhotos = checked;
  persistDisplayPreferences();
  mainWindowManager.getWindow()?.webContents.send('menu-toggle-captured-photos', showCapturedPhotos);
}

async function setShowRepositoryPhotos(checked) {
  showRepositoryPhotos = checked;
  persistDisplayPreferences();
  if (showRepositoryPhotos) {
    logger.info('[MENU] Mostrar imágenes del depósito activated');
    await ensureRepositoryMirrorStarted();
  }
  mainWindowManager.getWindow()?.webContents.send('menu-toggle-repository-photos', showRepositoryPhotos);
}

async function setShowRepositoryIndicators(checked) {
  showRepositoryIndicators = checked;
  persistDisplayPreferences();
  if (showRepositoryIndicators) {
    await ensureRepositoryMirrorStarted();
  }
  mainWindowManager.getWindow()?.webContents.send('menu-toggle-repository-indicators', showRepositoryIndicators);
}

/**
 * Whether the payment buttons and icons are on screen: the Ver option, saved
 * and part of the workspaces as it is, only counts with the orla service on
 */
function additionalActionsShown() {
  return showAdditionalActions && orlaEnabled;
}

function setShowAdditionalActions(checked) {
  showAdditionalActions = checked;
  persistDisplayPreferences();
  mainWindowManager.getWindow()?.webContents.send('menu-toggle-additional-actions', additionalActionsShown());
}

/**
 * The orla service was turned on or off in the preferences
 * @param {boolean} enabled
 */
function setOrlaEnabled(enabled) {
  orlaEnabled = enabled;
  logger.info(`[Orla] Service ${enabled ? 'enabled' : 'disabled'}`);
  createMenu();
  const mainWindow = mainWindowManager.getWindow();
  mainWindow?.webContents.send('orla-service-changed', orlaEnabled);
  mainWindow?.webContents.send('menu-toggle-additional-actions', additionalActionsShown());
}

function setShowCaptureHistory(checked) {
  showCaptureHistory = checked;
  persistDisplayPreferences();
  mainWindowManager.getWindow()?.webContents.send('menu-toggle-capture-history', showCaptureHistory);
}

async function setShowThumbnailGrid(checked) {
  showThumbnailGrid = checked;
  persistDisplayPreferences();
  // Repository thumbnails come from the local copy
  if (showThumbnailGrid && thumbnailGridSource === 'repository') {
    await ensureRepositoryMirrorStarted();
  }
  mainWindowManager.getWindow()?.webContents.send('menu-toggle-thumbnail-grid', showThumbnailGrid);
}

const DISPLAY_SETTERS = {
  showCapturedPhotos: setShowCapturedPhotos,
  showRepositoryPhotos: setShowRepositoryPhotos,
  showRepositoryIndicators: setShowRepositoryIndicators,
  showAdditionalActions: setShowAdditionalActions,
  showCaptureHistory: setShowCaptureHistory,
  showThumbnailGrid: setShowThumbnailGrid
};

/**
 * The display options a workspace saves, as they are now
 */
function getCurrentView() {
  return {
    showCapturedPhotos,
    showRepositoryPhotos,
    showRepositoryIndicators,
    showAdditionalActions,
    showCaptureHistory,
    showThumbnailGrid
  };
}

/**
 * Switch to a workspace: only the options that differ change, so the list
 * is not repainted for the ones already right
 * @param {string} id
 */
async function applyWorkspace(id) {
  const workspace = workspaceStore.get(id);
  if (!workspace) {
    return { success: false, error: 'Ese espacio de trabajo ya no existe.' };
  }

  const current = getCurrentView();
  for (const key of VIEW_KEYS) {
    if (current[key] !== workspace.view[key]) {
      await DISPLAY_SETTERS[key](workspace.view[key]);
    }
  }

  logger.info(`[Workspaces] Applied "${workspace.name}"`);
  return { success: true };
}

/**
 * The menu marks the workspace the view matches and lists the workspaces
 * with their shortcuts, so it is rebuilt whenever either changes; an open
 * Espacios de trabajo window refreshes too
 */
function refreshWorkspaces() {
  createMenu();
  mainWindowManager.getWindow()?.webContents.send('workspaces-changed');
}

function createMenu() {
  menuBuilder = new MenuBuilder({
    // Windows
    mainWindow: mainWindowManager.getWindow(),

    // State
    cameraEnabled,
    cameraAutoStart,
    selectedCameraId,
    availableCameras,
    showDuplicatesOnly,
    showCardPrintRequestsOnly,
    showPublicationRequestsOnly,
    showCapturedPhotos,
    showRepositoryPhotos,
    showRepositoryIndicators,
    showAdditionalActions,
    orlaEnabled,
    showCaptureHistory,
    showThumbnailGrid,
    sortByLinkDate,
    recentProjects,
    incomingRotation: projectPath ? sharedState.incomingRotation : null,
    workspaces: workspaceStore.visible(),
    activeWorkspaceId: workspaceStore.matching(getCurrentView()),

    // Logger
    logger,

    // Callbacks
    callbacks: {
      openRecentProject,
      getImageRepositoryPath: async () => {
        return await getImageRepositoryPath(dbManager);
      },
      setImageRepositoryPath: async (path) => {
        const saved = await setImageRepositoryPath(dbManager, path);
        if (saved) {
          // A new project gets its repository after it is created: this is
          // when its XML is first shared with the other teams
          const shared = await publishProjectXml(dbManager, path);
          logger.info(`School XML on repository change: ${shared.status}`, shared.fileName || shared.error || null);
        }
        return saved;
      },
      reinitializeRepositoryMirror,
      setIncomingRotation: async (degrees) => {
        if (!dbManager) {
          warnNoProject();
          return;
        }
        try {
          await setIncomingRotation(dbManager, degrees);
          sharedState.incomingRotation = degrees;
          logger.info(`[Menu] Photos reaching the ingest folder turned ${degrees}°`);
          mainWindowManager.getWindow()?.webContents.send('incoming-rotation-changed', degrees);
        } catch (error) {
          logger.error('Error saving incoming rotation', error);
        }
        createMenu();
      },
      configureIngestFolder: async () => {
        try {
          const result = await configureIngestFolder(getIngestContext());
          const mainWindow = mainWindowManager.getWindow();
          if (result.changed && mainWindow) {
            mainWindow.webContents.send('ingest-folder-changed');
          }
        } catch (error) {
          logger.error('Error configuring ingest folder', error);
          showAppMessage(mainWindowManager.getWindow(), {
            title: 'Error',
            message: 'No se pudo cambiar la carpeta de entrada.',
            detail: error.message
          });
        }
      },
      toggleCamera: () => {
        cameraEnabled = !cameraEnabled;
        if (cameraEnabled) {
          openCameraWindow();
        } else {
          closeCameraWindow();
        }
        createMenu();
      },
      openCameraWindow,
      selectCamera: (deviceId) => {
        selectedCameraId = deviceId;
        const cameraWindow = cameraWindowManager.getWindow();
        if (cameraWindow) {
          cameraWindow.webContents.send('change-camera', selectedCameraId);
        }
        createMenu();
      },
      setCameraAutoStart: (checked) => {
        cameraAutoStart = checked;
        // Kept between sessions; openRecentProject acts on it at startup
        const config = loadGlobalConfig();
        config.cameraAutoStart = cameraAutoStart;
        saveGlobalConfig(config);
      },
      toggleDuplicates: (checked) => {
        showDuplicatesOnly = checked;
        // Exclusive filter: disable others when this is enabled
        if (checked) {
          showCardPrintRequestsOnly = false;
          showPublicationRequestsOnly = false;
        }
        persistDisplayPreferences();
        // Update menuBuilder properties and rebuild menu to update all checkboxes
        menuBuilder.showDuplicatesOnly = showDuplicatesOnly;
        menuBuilder.showCardPrintRequestsOnly = showCardPrintRequestsOnly;
        menuBuilder.showPublicationRequestsOnly = showPublicationRequestsOnly;
        menuBuilder.build();
        const mainWindow = mainWindowManager.getWindow();
        if (mainWindow) {
          mainWindow.webContents.send('menu-toggle-duplicates', showDuplicatesOnly);
        }
      },
      toggleCardPrintRequests: (checked) => {
        showCardPrintRequestsOnly = checked;
        // Exclusive filter: disable others when this is enabled
        if (checked) {
          showDuplicatesOnly = false;
          showPublicationRequestsOnly = false;
        }
        persistDisplayPreferences();
        // Update menuBuilder properties and rebuild menu to update all checkboxes
        menuBuilder.showDuplicatesOnly = showDuplicatesOnly;
        menuBuilder.showCardPrintRequestsOnly = showCardPrintRequestsOnly;
        menuBuilder.showPublicationRequestsOnly = showPublicationRequestsOnly;
        menuBuilder.build();
        const mainWindow = mainWindowManager.getWindow();
        if (mainWindow) {
          mainWindow.webContents.send('menu-toggle-card-print-requests', showCardPrintRequestsOnly);
        }
      },
      togglePublicationRequests: (checked) => {
        showPublicationRequestsOnly = checked;
        // Exclusive filter: disable others when this is enabled
        if (checked) {
          showDuplicatesOnly = false;
          showCardPrintRequestsOnly = false;
        }
        persistDisplayPreferences();
        // Update menuBuilder properties and rebuild menu to update all checkboxes
        menuBuilder.showDuplicatesOnly = showDuplicatesOnly;
        menuBuilder.showCardPrintRequestsOnly = showCardPrintRequestsOnly;
        menuBuilder.showPublicationRequestsOnly = showPublicationRequestsOnly;
        menuBuilder.build();
        const mainWindow = mainWindowManager.getWindow();
        if (mainWindow) {
          mainWindow.webContents.send('menu-toggle-publication-requests', showPublicationRequestsOnly);
        }
      },
      // Each option switched by hand may make the view match a workspace,
      // or stop matching the one marked
      toggleCapturedPhotos: (checked) => {
        setShowCapturedPhotos(checked);
        refreshWorkspaces();
      },
      toggleRepositoryPhotos: async (checked) => {
        await setShowRepositoryPhotos(checked);
        refreshWorkspaces();
      },
      toggleRepositoryIndicators: async (checked) => {
        await setShowRepositoryIndicators(checked);
        refreshWorkspaces();
      },
      toggleAdditionalActions: (checked) => {
        setShowAdditionalActions(checked);
        refreshWorkspaces();
      },
      toggleCaptureHistory: (checked) => {
        setShowCaptureHistory(checked);
        refreshWorkspaces();
      },
      toggleThumbnailGrid: async (checked) => {
        await setShowThumbnailGrid(checked);
        refreshWorkspaces();
      },
      // The order of the list, like the filters, is not part of a workspace
      toggleSortByLinkDate: (checked) => {
        sortByLinkDate = checked;
        persistDisplayPreferences();
        mainWindowManager.getWindow()?.webContents.send('menu-toggle-sort-by-link-date', sortByLinkDate);
      },
      applyWorkspace: async (id) => {
        await applyWorkspace(id);
        refreshWorkspaces();
      },
      openWorkspaces: (mode) => {
        mainWindowManager.getWindow()?.webContents.send('menu-workspaces', mode);
      },
      refreshRepositoryImages: async () => {
        logger.info('[Menu] Manual repository refresh requested');
        const mainWindow = mainWindowManager.getWindow();

        if (repositoryMirror) {
          // Force a full resync by marking all files for resync
          await repositoryMirror.forceFullResync();
        } else {
          // The local copy only starts when something needs it, and with the
          // Ver repository options off nothing had: this used to do nothing.
          // Starting it already syncs every file.
          if (!dbManager) {
            warnNoProject();
            return;
          }

          await ensureRepositoryMirrorStarted();

          if (!repositoryMirror) {
            warnNoRepository();
            return;
          }
        }

        // Broadcast to all windows
        if (mainWindow) {
          mainWindow.webContents.send('repository-changed', { type: 'manual-refresh' });
        }
        const imageGridWindow = imageGridWindowManager.getWindow();
        if (imageGridWindow) {
          imageGridWindow.webContents.send('repository-changed', { type: 'manual-refresh' });
        }
        const repositoryGridWindow = repositoryGridWindowManager.getWindow();
        if (repositoryGridWindow) {
          repositoryGridWindow.webContents.send('repository-changed', { type: 'manual-refresh' });
        }
        notifyGroupCoverageRepositoryChanged();
      },
      openImageGridWindow,
      openRepositoryGridWindow,
      openPrintedCardsWindow,
      openGroupCoverageWindow,
      openHelpWindow,
      openViewerMirrorWindow,
      // Setting the application menu puts it back on the viewer mirror too
      onApplicationMenuSet: () => viewerMirrorWindowManager.removeMenu(),
      openPOC: () => {
        const { shell } = require('electron');
        const pocPath = path.join(__dirname, 'src', 'renderer', '_poc', 'poc-test.html');
        shell.openPath(pocPath);
        logger.info('[POC] Abriendo POC test en navegador');
      }
    }
  });

  menuBuilder.build();
}

// did-finish-load fires on every navigation, including a renderer reload, but
// the recent project must only be opened on the first one, whether or not
// there was one to open
let hasAutoOpenedRecentProject = false;

function createWindow() {
  const isDev = process.argv.includes('--dev');
  const mainWindow = mainWindowManager.create({ isDev });

  // Wait for renderer to be ready before sending events
  mainWindow.webContents.on('did-finish-load', () => {
    const isFirstLoad = !hasAutoOpenedRecentProject;
    hasAutoOpenedRecentProject = true;

    // Send initial display preferences to renderer
    mainWindowManager.sendInitialPreferences({
      showDuplicatesOnly,
      showCardPrintRequestsOnly,
      showPublicationRequestsOnly,
      showCapturedPhotos,
      showRepositoryPhotos,
      showRepositoryIndicators,
      showAdditionalActions: additionalActionsShown(),
      orlaEnabled,
      showCaptureHistory,
      showThumbnailGrid,
      thumbnailGridSource,
      sortByLinkDate
    });

    // A reload (Ctrl+R) starts the renderer from scratch, and it only learns
    // that a project is open from this message. Without it the list stayed
    // empty and every action asked to open a project that was already open.
    if (projectPath && dbManager) {
      logger.info('[RELOAD] Renderer reloaded with a project open, telling it again');
      mainWindow.webContents.send('project-opened', { success: true });
    } else if (isFirstLoad && recentProjects && recentProjects.length > 0) {
      // Auto-open most recent project if available. Only on the first load:
      // a reload after closing the project must not open it again.
      // Repository mirror will be started after project opens (if preferences enabled)
      const mostRecentProjectPath = recentProjects[0];
      logger.info(`[STARTUP] Auto-opening most recent project: ${mostRecentProjectPath}`);

      // Deferred so the synchronous start of openRecentProject does not run
      // inside this handler. setImmediate yields without the arbitrary wait a
      // fixed timeout would add to every startup.
      setImmediate(async () => {
        await openRecentProject(mostRecentProjectPath);

        // Cámara > Activar la cámara al iniciar. Only with a project, since
        // captures are saved into the project's input folder.
        if (cameraAutoStart && projectPath && !cameraEnabled) {
          logger.info('[STARTUP] Starting the camera, as set in the Cámara menu');
          cameraEnabled = true;
          openCameraWindow();
          createMenu();
        }
      });
    }
  });

  // The secondary windows have no life of their own: closing the main window
  // has to take them with it. Leaving any of them open also keeps the process
  // alive, because 'window-all-closed' never fires.
  mainWindow.on('closed', () => {
    closeSecondaryWindows();
  });

  // The automatic update check waits until the window is on screen, and then
  // some more, so it never competes with opening the project
  mainWindow.once('ready-to-show', () => {
    if (updateManager) {
      updateManager.scheduleStartupCheck();
    }

    // With the orla service on and a receipt printer configured, the helper is
    // started ahead of the
    // first receipt, once the window and the project are done starting
    if (orlaEnabled && loadGlobalConfig().printer) {
      setTimeout(() => receiptPrinter.warmUp(), 5000);
    }
  });
}

// Where the installers are published. Kept as a constant on purpose: the
// package.json inside a packaged app has no "build" field (electron-builder
// strips it), and reading build.publish from it made 1.7.0 fail before it
// could open a window. Must match build.publish in package.json.
const GITHUB_RELEASES_URL = 'https://github.com/moon-brain/user-capture-app/releases';

/**
 * Update checker against the GitHub Releases of the project
 */
function createUpdateManager() {
  return new UpdateManager({
    autoUpdater,
    isPackaged: app.isPackaged,
    platform: process.platform,
    logger,
    loadPreferences: getUpdatePreferences,
    savePreferences: saveUpdatePreferences,
    getMainWindow: () => mainWindowManager.getWindow(),
    openExternal: (url) => shell.openExternal(url),
    releasesUrl: GITHUB_RELEASES_URL,
    // Lets `npm run dev -- --dev-updates` test against the real releases with
    // a local dev-app-update.yml (see docs/ACTUALIZACIONES_Y_RELEASE_PLAN.md)
    forceDevConfig: process.argv.includes('--dev-updates')
  });
}

/**
 * Close every window other than the main one
 */
function closeSecondaryWindows() {
  secondaryWindowManagers.forEach((manager) => manager.close());
}

function openCameraWindow() {
  const isDev = process.argv.includes('--dev');
  cameraWindowManager.open({ isDev, onClosed: handleCameraWindowClosed });
}

// However the camera window goes away, its close button included, the camera
// is off: the menu used to keep offering to turn it off and to show a window
// that no longer existed
function handleCameraWindowClosed() {
  if (!cameraEnabled) return;
  cameraEnabled = false;

  const mainWindow = mainWindowManager.getWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    createMenu();
  }
}

function closeCameraWindow() {
  cameraWindowManager.close();
}

function warnNoProject() {
  showAppMessage(mainWindowManager.getWindow(), {
    title: 'Proyecto no abierto',
    message: 'Debes abrir o crear un proyecto primero.'
  });
}

function warnNoRepository() {
  showAppMessage(mainWindowManager.getWindow(), {
    title: 'Depósito no configurado',
    message: 'Debes configurar el depósito de imágenes primero.',
    detail: 'Ve a Proyecto > Configurar depósito de imágenes.'
  });
}

// The manual needs no open project: it is most useful before creating one
function openHelpWindow(target = {}) {
  const isDev = process.argv.includes('--dev');
  helpWindowManager.open({ isDev, target });
}

function openPrintedCardsWindow() {
  if (!dbManager) {
    warnNoProject();
    return;
  }

  const isDev = process.argv.includes('--dev');
  printedCardsWindowManager.open({ isDev });
}

// The photos by group window counts repository photos too, when showing them
function notifyGroupCoverageRepositoryChanged() {
  const win = groupCoverageWindowManager.getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('repository-changed');
  }
}

// Ver > Fotografías por grupo
function openGroupCoverageWindow() {
  if (!dbManager) {
    warnNoProject();
    return;
  }

  const isDev = process.argv.includes('--dev');
  groupCoverageWindowManager.open({ isDev });
}

// Ver > Visor en ventana aparte. Needs no project: without one it says the
// viewer is empty. It opens where it was last left, if that display is still
// connected, so it goes back to the second monitor by itself
function openViewerMirrorWindow() {
  const { screen } = require('electron');
  const isDev = process.argv.includes('--dev');
  const saved = loadGlobalConfig().viewerMirror || {};
  const onScreen = ViewerMirrorWindowManager.isOnScreen(saved.bounds, screen.getAllDisplays());

  viewerMirrorWindowManager.open({
    isDev,
    bounds: onScreen ? saved.bounds : null,
    fullScreen: onScreen && saved.fullScreen === true,
    onPlacementChange: (placement) => {
      const config = loadGlobalConfig();
      config.viewerMirror = placement;
      saveGlobalConfig(config);
    }
  });
}

function openImageGridWindow() {
  if (!dbManager) {
    warnNoProject();
    return;
  }

  const isDev = process.argv.includes('--dev');
  imageGridWindowManager.open({ isDev });
}

async function openRepositoryGridWindow() {
  if (!dbManager) {
    warnNoProject();
    return;
  }

  // Check if repository path is configured
  const repositoryPath = await getImageRepositoryPath(dbManager);
  if (!repositoryPath) {
    warnNoRepository();
    return;
  }

  // Start mirror lazily when opening repository grid
  await ensureRepositoryMirrorStarted();

  const isDev = process.argv.includes('--dev');
  repositoryGridWindowManager.open({ isDev });
}

// ============================================================================
// Helper Functions
// ============================================================================

// Helper function to ensure Eliminados group exists
async function ensureDeletedGroup() {
  const deletedGroupCode = 'ELIMINADOS';
  const deletedGroupName = '⚠ Eliminados';

  const groups = await dbManager.getGroups();
  let deletedGroup = groups.find(g => g.code === deletedGroupCode);

  if (!deletedGroup) {
    // Create the group
    await dbManager.importUsers({
      groups: [{ code: deletedGroupCode, name: deletedGroupName }],
      students: [],
      teachers: [],
      nonTeachingStaff: []
    });
    logger.info(`Created Eliminados group: ${deletedGroupCode}`);
    deletedGroup = { code: deletedGroupCode, name: deletedGroupName };
  }

  return deletedGroup;
}

/**
 * Release everything tied to the currently open project
 *
 * Must run before opening another project. Every resource here belongs to one
 * project: the sqlite connection holds a file lock, the folder watcher keeps
 * reporting images from the old ingest folder, and the repository mirror is
 * built from the project's own repository path, so leaving it running would
 * resolve the new project's photos against the previous project's repository.
 */
async function closeCurrentProject() {
  if (folderWatcher) {
    await folderWatcher.stop();
    folderWatcher = null;
  }
  sharedState.incomingRotation = 0;
  sharedState.webcamCaptures.clear();

  if (repositoryMirror) {
    await repositoryMirror.stopWatch();
    repositoryMirror = null;
  }

  repositoryCacheManager.invalidateCache();

  if (dbManager) {
    await dbManager.close();
    dbManager = null;
  }

  imageManager = null;
  projectPath = null;
  currentRepositoryPath = null;

  // Its counts belong to the project that is going away
  groupCoverageWindowManager.close();
}

// Repository mirror management
async function reinitializeRepositoryMirror() {
  // Stop existing mirror if running
  if (repositoryMirror) {
    await repositoryMirror.stopWatch();
    repositoryMirror = null;
  }

  // Clear repository cache
  repositoryCacheManager.invalidateCache();

  // Start new mirror with new path
  await ensureRepositoryMirrorStarted();

  // Wait a bit for the sync to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Notify all windows to reload repository data
  const mainWindow = mainWindowManager.getWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('repository-changed');
  }

  const repositoryGridWindow = repositoryGridWindowManager.getWindow();
  if (repositoryGridWindow && !repositoryGridWindow.isDestroyed()) {
    repositoryGridWindow.webContents.send('repository-changed');
  }

  notifyGroupCoverageRepositoryChanged();
}

// Long enough after opening for the mirror's first sync to have the disk to
// itself; the folder of replaced photos is not urgent
const REPLACED_NOTICE_DELAY = 30000;

// Same idea for the thumbnail cache, which is only swept to keep it capped
const THUMBNAIL_PRUNE_DELAY = 60000;

/**
 * Offer to purge the replaced photos when there are enough of them
 *
 * Nothing in the repository is ever deleted without being asked for: it is
 * shared by the computers of the whole centre. But a folder nobody opens is a
 * folder nobody purges, so once the pile is big and old the app says so and
 * opens the purge window for whoever wants it.
 *
 * @param {string} repositoryPath - The repository as it was when the mirror started
 */
function offerReplacedArchivePurge(repositoryPath) {
  setTimeout(async () => {
    try {
      const mainWindow = mainWindowManager.getWindow();

      // The project may have been closed, or another one opened, by now
      if (!mainWindow || mainWindow.isDestroyed() || currentRepositoryPath !== repositoryPath) {
        return;
      }

      const scan = await scanReplacedArchive(repositoryPath);
      const { lastNotice } = getReplacedArchiveNotice();

      if (!shouldNoticeArchive({ runs: scan.runs, photos: scan.photos, lastNotice })) {
        return;
      }

      // Written down before asking: an offer ignored is an offer made, and
      // this must not come back at every opening
      saveReplacedArchiveNotice(new Date().toISOString());
      logger.info(`Replaced photos folder holds ${scan.photos} photos in ${scan.runs.length} runs`);

      const answer = await askAppQuestion(mainWindow, {
        title: 'Fotos reemplazadas',
        message: `El depósito guarda ${scan.photos} fotos sustituidas por exportaciones anteriores.`,
        detail: 'Puedes borrar las más antiguas para recuperar espacio. '
          + 'Este aviso no volverá a aparecer en un mes.',
        choices: ['Purgar ahora'],
        cancel: 'Más tarde'
      });

      if (answer === 0 && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('menu-purge-replaced-archive');
      }
    } catch (error) {
      logger.warning(`Could not check the replaced photos folder: ${error.message}`);
    }
  }, REPLACED_NOTICE_DELAY);
}

async function ensureRepositoryMirrorStarted() {
  // Only start if not already running and repository path is set
  if (repositoryMirror) {
    return; // Already running
  }

  // Check if there's a project open
  if (!dbManager) {
    return; // No project open yet
  }

  const repositoryPath = await getImageRepositoryPath(dbManager);
  if (!repositoryPath) {
    return;
  }

  // Remembered so the image protocol can serve repository photos even before
  // the mirror finishes starting, when paths still point at the repository
  currentRepositoryPath = repositoryPath;

  logger.info('Initializing repository mirror (lazy initialization)...');

  // Create mirror path
  const mirrorPath = path.join(app.getPath('userData'), 'repository-mirror');

  // Initialize mirror
  repositoryMirror = new RepositoryMirror(repositoryPath, mirrorPath, logger);

  // Initialize in background (non-blocking)
  setImmediate(async () => {
    try {
      logger.info(`Repository path: ${repositoryPath}`);
      logger.info(`Mirror path: ${mirrorPath}`);

      const initialized = await repositoryMirror.initialize();
      if (initialized) {
        logger.success('Repository mirror initialized');

        offerReplacedArchivePurge(repositoryPath);

      // Listen to sync events
      repositoryMirror.on('sync-started', () => {
        logger.info('Repository sync started');
      });

      repositoryMirror.on('sync-progress', (data) => {
        if (data.phase === 'syncing' && data.current % 50 === 0) {
          logger.info(`Syncing: ${data.current}/${data.total} files`);
        }
        // Send progress to repository grid window
        const repositoryGridWindow = repositoryGridWindowManager.getWindow();
        if (repositoryGridWindow && !repositoryGridWindow.isDestroyed()) {
          repositoryGridWindow.webContents.send('sync-progress', data);
        }
      });

      repositoryMirror.on('sync-completed', (result) => {
        if (result.success) {
          logger.success(`Sync completed: ${result.synced} files synced`);
          // Notify all windows about repository changes
          const mainWindow = mainWindowManager.getWindow();
          if (mainWindow) {
            mainWindow.webContents.send('repository-changed');
            mainWindow.webContents.send('sync-completed', result);
          }
          notifyGroupCoverageRepositoryChanged();
          // Send completion event to repository grid window
          const repositoryGridWindow = repositoryGridWindowManager.getWindow();
          if (repositoryGridWindow && !repositoryGridWindow.isDestroyed()) {
            repositoryGridWindow.webContents.send('sync-completed', result);
          }
        } else {
          logger.error(`Sync failed: ${result.error}`);
          // Send sync-completed event with error to main window
          const mainWindow = mainWindowManager.getWindow();
          if (mainWindow) {
            mainWindow.webContents.send('sync-completed', result);
          }
          // Send error to repository grid window
          const repositoryGridWindow = repositoryGridWindowManager.getWindow();
          if (repositoryGridWindow && !repositoryGridWindow.isDestroyed()) {
            repositoryGridWindow.webContents.send('sync-completed', result);
          }
        }
      });

      repositoryMirror.on('file-synced', (filename) => {
        // File synced - could update UI here if needed
      });

      // Listen for repository changes detected by watcher
      repositoryMirror.on('repository-changed', (data) => {
        logger.info(`Repository change detected: ${data.type} - ${data.filename}`);

        // Notify windows immediately about the change (before sync completes)
        const mainWindow = mainWindowManager.getWindow();
        if (mainWindow) {
          logger.info('Notifying main window about repository change');
          mainWindow.webContents.send('repository-changed', data);
        }

        const repositoryGridWindow = repositoryGridWindowManager.getWindow();
        if (repositoryGridWindow) {
          logger.info('Notifying repository grid window about repository change');
          repositoryGridWindow.webContents.send('repository-changed', data);
        }

        notifyGroupCoverageRepositoryChanged();

        // The watcher will automatically trigger a debounced sync
      });

      // Start initial sync
      repositoryMirror.startSync();

      // Start watching for repository changes
      const watchStarted = await repositoryMirror.startWatch();
      if (watchStarted) {
        logger.success('Repository folder watching enabled - automatic sync on changes');
      } else {
        logger.warning('Failed to start repository folder watch');
      }
    } else {
      logger.error('Failed to initialize repository mirror');
    }
    } catch (error) {
      logger.error('Error in repository mirror initialization:', error);
    }
  });
}

// Helper function to update window title with project name
function updateWindowTitle() {
  mainWindowManager.updateTitle(projectPath);
}

// Wrapper for loadRecentProjects to populate global variable
function loadRecentProjects() {
  recentProjects = loadRecentProjectsUtil();
}

// Wrapper for addRecentProject with additional logic
function addRecentProject(folderPath) {
  recentProjects = addRecentProjectUtil(folderPath, recentProjects);
  saveRecentProjectsUtil(recentProjects);
  createMenu();
}

async function openRecentProject(folderPath) {
  try {
    // Initialize logger for this project
    logger.initialize(folderPath);
    logger.section('OPENING RECENT PROJECT');
    logger.info('Recent project selected', { folderPath });

    if (!fs.existsSync(folderPath)) {
      throw new Error('La carpeta del proyecto no existe');
    }

    // Release the previous project before taking over its globals
    await closeCurrentProject();

    projectPath = folderPath;
    const dataPath = path.join(folderPath, 'data');
    const dbPath = path.join(dataPath, 'users.db');

    logger.info('Validating project structure...');
    if (!fs.existsSync(dbPath)) {
      throw new Error('No se encontró la base de datos del proyecto');
    }
    logger.success('Project structure validated');

    // Initialize database
    logger.section('LOADING DATABASE');
    logger.info(`Database path: ${dbPath}`);
    dbManager = new DatabaseManager(dbPath);
    await dbManager.initialize();
    logger.success('Database loaded successfully');

    const importsPath = path.join(folderPath, 'imports');

    // Initialize image manager
    logger.section('INITIALIZING MANAGERS');
    imageManager = new ImageManager(importsPath);
    logger.info('Image manager initialized');

    await startIngestWatcher(getIngestContext());

    logger.section('PROJECT OPENED SUCCESSFULLY');
    logger.success('Project loaded', { projectPath: folderPath });

    // Add to recent projects
    addRecentProject(folderPath);

    // Update window title
    updateWindowTitle();

    // Notify renderer
    const mainWindow = mainWindowManager.getWindow();
    if (mainWindow) {
      mainWindow.webContents.send('project-opened', { success: true });
    }

    // Start repository mirror if something on screen shows repository photos
    const gridShowsRepository = showThumbnailGrid && thumbnailGridSource === 'repository';
    if (showRepositoryPhotos || showRepositoryIndicators || gridShowsRepository) {
      logger.info('[PROJECT-OPEN] Repository options enabled, starting repository mirror');
      await ensureRepositoryMirrorStarted();
    }
  } catch (error) {
    logger.error('Error opening recent project', error);
    showAppMessage(mainWindowManager.getWindow(), {
      title: 'Error',
      message: 'No se pudo abrir el proyecto.',
      detail: error.message
    });
  }
}

// ============================================================================
// IPC Handler Registration
// ============================================================================

/**
 * Register all IPC handlers
 */
function registerIPCHandlers() {
  const state = sharedState;

  // Create shared context object for all handlers
  /** @type {import('./src/main/ipc/context').IpcContext} */
  const context = {
    mainWindow: () => mainWindowManager.getWindow(),
    logger,
    state,
    repositoryCacheManager,
    repositoryMirror: () => repositoryMirror,
    imageGridWindow: () => imageGridWindowManager.getWindow(),
    groupCoverageWindow: () => groupCoverageWindowManager.getWindow(),
    repositoryGridWindow: () => repositoryGridWindowManager.getWindow(),
    createMenu,
    addRecentProject,
    updateWindowTitle,
    ensureDeletedGroup,
    ensureRepositoryMirrorStarted,
    reinitializeRepositoryMirror,
    closeCurrentProject,
    updateManager: () => updateManager,
    openHelpWindow,
    workspaceStore,
    receiptPrinter: () => receiptPrinter,
    thumbnailService: () => thumbnailService,
    getCurrentView,
    applyWorkspace,
    refreshWorkspaces,
    onOrlaServiceChanged: setOrlaEnabled
  };

  // Register all handler modules
  registerProjectHandlers(context);
  registerUserGroupImageHandlers(context);
  registerExportHandlers(context);
  registerMiscHandlers(context);
  registerUpdateHandlers(context);
  registerHelpHandlers(context);
  registerAppDialogHandlers();
  registerWorkspaceHandlers(context);

  // Ver > Visor en ventana aparte
  ipcMain.on('viewer-image-changed', (event, image) => {
    viewerMirrorWindowManager.setImage(image);
  });
  ipcMain.handle('get-viewer-mirror-image', () => viewerMirrorWindowManager.getImage());
  ipcMain.on('viewer-mirror-set-fullscreen', (event, mode) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    win.setFullScreen(mode === 'toggle' ? !win.isFullScreen() : Boolean(mode));
  });

  // Capturadas | Depósito above the thumbnails
  ipcMain.handle('set-thumbnail-grid-source', async (event, source) => {
    thumbnailGridSource = source === 'repository' ? 'repository' : 'captured';
    const config = loadGlobalConfig();
    config.thumbnailGridSource = thumbnailGridSource;
    saveGlobalConfig(config);
    if (showThumbnailGrid && thumbnailGridSource === 'repository') {
      await ensureRepositoryMirrorStarted();
    }
    return { success: true, source: thumbnailGridSource };
  });

  // Filter toggle handlers from renderer (badge clicks)
  ipcMain.on('menu-toggle-duplicates-from-renderer', (event, enabled) => {
    const menu = menuBuilder.callbacks?.toggleDuplicates;
    if (menu) {
      menu(enabled);
    }
  });

  ipcMain.on('menu-toggle-card-print-requests-from-renderer', (event, enabled) => {
    const menu = menuBuilder.callbacks?.toggleCardPrintRequests;
    if (menu) {
      menu(enabled);
    }
  });

  ipcMain.on('menu-toggle-publication-requests-from-renderer', (event, enabled) => {
    const menu = menuBuilder.callbacks?.togglePublicationRequests;
    if (menu) {
      menu(enabled);
    }
  });
}

app.whenReady().then(() => {
  // Load display preferences from config
  const config = loadGlobalConfig();
  showDuplicatesOnly = config.showDuplicatesOnly ?? false;
  showCardPrintRequestsOnly = config.showCardPrintRequestsOnly ?? false;
  showPublicationRequestsOnly = config.showPublicationRequestsOnly ?? false;
  showCapturedPhotos = config.showCapturedPhotos ?? true;
  showRepositoryPhotos = config.showRepositoryPhotos ?? false;
  showRepositoryIndicators = config.showRepositoryIndicators ?? false;
  showAdditionalActions = config.showAdditionalActions ?? true;
  orlaEnabled = isOrlaServiceEnabled(config);
  showCaptureHistory = config.showCaptureHistory ?? false;
  showThumbnailGrid = config.showThumbnailGrid ?? false;
  sortByLinkDate = config.sortByLinkDate ?? false;
  thumbnailGridSource = config.thumbnailGridSource === 'repository' ? 'repository' : 'captured';
  cameraAutoStart = config.cameraAutoStart ?? false;

  // Serve user photos before any window can ask for one
  thumbnailService = new ThumbnailService(
    path.join(app.getPath('userData'), 'thumbnail-cache'),
    logger
  );
  registerImageProtocol({
    thumbnailService,
    getAllowedRoots: getImageRoots,
    logger
  });

  // Once, in the background, well after the window is up: the cache is capped,
  // not managed, and reading the folder must not delay anything
  setTimeout(() => {
    thumbnailService.pruneCache().catch((error) => {
      logger.warning(`Could not prune the thumbnail cache: ${error.message}`);
    });
  }, THUMBNAIL_PRUNE_DELAY);

  loadRecentProjects();
  createMenu();

  // Nothing about updates may keep the window from opening: a throw here
  // would reject whenReady() and leave the app running with no window
  try {
    updateManager = createUpdateManager();
  } catch (error) {
    logger.error('[Updates] Update checker disabled:', error);
    updateManager = null;
  }

  createWindow();

  // Register all IPC handlers
  registerIPCHandlers();

  // DO NOT start repository watcher automatically on startup
  // It will be started lazily when needed (when user enables repository options)
  // This prevents blocking on Google Drive during startup

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (updateManager) {
    updateManager.dispose();
  }
  receiptPrinter.dispose();

  // Cleanup repository mirror watcher
  if (repositoryMirror) {
    repositoryMirror.stopWatch();
  }

  // Log writes are buffered, so the tail of the log would be lost without this
  logger.close();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
