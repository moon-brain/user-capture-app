// Architecture modules are loaded via script tags in index.html
// Available globals: store, BaseModal, NewProjectModal, ConfirmModal, InfoModal, UpdateModal, UserImageModal, UserRowRenderer, VirtualScrollManager, ImageGridManager, CaptureHistoryManager, ExportManager, OrlaExportManager, PhotoRosterExportManager, PhotoRosterModal, ExportOptionsModal, InventoryExportOptionsModal, CropModal, AddTagModal, ImageTagsManager, SelectionModeManager, DragDropManager, ProgressManager, LazyImageManager, KeyboardNavigationManager, MenuEventManager, UserDataManager, ProjectManager

// Component instances
let userRowRenderer = null;
let imageGridManager = null;
let captureHistoryManager = null;
let exportManager = null;
let orlaExportManager = null;
let photoRosterExportManager = null;
let imageTagsManager = null;
let selectionModeManager = null;
let dragDropManager = null;
let progressManager = null;
let lazyImageManager = null;
let keyboardNavigationManager = null;
let menuEventManager = null;
let userDataManager = null;
let projectManager = null;

// State management
let currentUsers = [];
let allUsers = []; // All users from database for duplicate checking
let currentGroups = [];
let selectedUser = null;
let projectOpen = false;
let showDuplicatesOnly = false;
let showCardPrintRequestsOnly = false;
let showPublicationRequestsOnly = false;
let showCapturedPhotos = true;
let showRepositoryPhotos = false;  // Default to false to avoid blocking on Google Drive
let showRepositoryIndicators = false;  // Default to false to avoid blocking on Google Drive
let showAdditionalActions = true;  // Show/hide additional actions section and related indicators
let orlaEnabled = true;  // Preferencias > Orla de graduación
let showCaptureHistory = false;  // Show/hide the capture history strip beside the viewer
// Ver > Vista de miniaturas, and whose photos it shows: 'captured' or 'repository'
let showThumbnailGrid = false;
// Ver > Ordenar por fecha de enlace: most recently linked first, with the date
let sortByLinkDate = false;
let thumbnailGridSource = 'captured';
let thumbnailGridManager = null;
// Proyecto > Girar las fotos entrantes, for the notice over the viewer
let incomingRotation = 0;
let isLoadingRepositoryPhotos = false;  // Track if repository photos are being loaded
let isLoadingRepositoryIndicators = false;  // Track if repository indicators are being loaded
let repositorySyncCompleted = false;  // Track if initial repository sync has completed
// Bumped whenever the repository changes. Repository files keep their name when
// the mirror overwrites them, so this is what makes their image URLs change.
let repositoryImageVersion = 0;

// Selection mode state (deprecated - now managed by SelectionModeManager)
// Kept for backward compatibility during transition
let selectionMode = false;
let selectedUsers = new Set(); // Store selected user IDs

// Card print requests
let cardPrintRequests = new Set(); // Store user IDs with pending card print requests
let publicationRequests = new Set(); // Store user IDs with pending publication requests

// Virtual scrolling
let virtualScrollManager = null;
let displayedUsers = []; // Currently displayed users (filtered/duplicates)

// DOM Elements
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const groupFilter = document.getElementById('group-filter');
const userTableBody = document.getElementById('user-table-body');
const photosColumnHeader = document.getElementById('photos-column-header');
const selectedUserInfo = document.getElementById('selected-user-info');
const userCount = document.getElementById('user-count');
const linkBtn = document.getElementById('link-btn');
const payOrlaBtn = document.getElementById('pay-orla-btn');
const importReceiptBtn = document.getElementById('import-receipt-btn');
const duplicatesAlert = document.getElementById('duplicates-alert');
const duplicatesCount = document.getElementById('duplicates-count');
const cardPrintAlert = document.getElementById('card-print-alert');
const cardPrintCount = document.getElementById('card-print-count');
const publicationAlert = document.getElementById('publication-alert');
const publicationCount = document.getElementById('publication-count');
const imagePreviewContainer = document.getElementById('image-preview-container');
const currentImage = document.getElementById('current-image');
const prevImageBtn = document.getElementById('prev-image');
const nextImageBtn = document.getElementById('next-image');
const loadingSpinner = document.getElementById('loading-spinner');
const noProjectPlaceholder = document.getElementById('no-project-placeholder');
const captureHistoryPanel = document.getElementById('capture-history');
const captureHistoryList = document.getElementById('capture-history-list');
const captureHistoryEmpty = document.getElementById('capture-history-empty');

// Modal DOM elements (legacy - will be replaced by modal instances)
const progressModal = document.getElementById('progress-modal');

// Modal instances (new architecture)
let newProjectModalInstance = null;
let confirmModalInstance = null;
let infoModalInstance = null;
let choiceModalInstance = null;
let workspacesModalInstance = null;
let appDialogManager = null;
let updateModalInstance = null;
let exportOptionsModalInstance = null;
let inventoryExportOptionsModalInstance = null;
let cropModalInstance = null;
let addTagModalInstance = null;
let userImageModalInstance = null;
let photoRosterModalInstance = null;
let restoreBackupModalInstance = null;
let replacedArchiveModalInstance = null;
let pendingRequestsModalInstance = null;
let exportScopeModalInstance = null;
let preferencesModalInstance = null;
let projectInfoModalInstance = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize modal instances
  initializeModals();

  // Initialize user row renderer
  initializeUserRowRenderer();

  // Initialize virtual scroll manager
  initializeVirtualScroll();

  // Ver > Vista de miniaturas
  initializeThumbnailGrid();

  // The viewer's rotate buttons and Proyecto > Girar las fotos entrantes
  initializeImageRotation();

  // Right click on the viewer: crop the photo, or restore its original
  initializeViewerContextMenu();

  // Initialize image grid manager
  initializeImageGridManager();
  // After a reload the viewer starts empty, whatever the mirror was showing
  publishViewerImage();

  // Initialize capture history strip
  initializeCaptureHistoryManager();

  // Initialize export manager
  initializeExportManager();

  // Initialize orla export manager
  initializeOrlaExportManager();

  initializePhotoRosterExportManager();

  // Initialize image tags manager
  initializeImageTagsManager();

  // Initialize selection mode manager
  initializeSelectionModeManager();

  // Initialize drag and drop manager
  initializeDragDropManager();

  // Initialize progress manager
  initializeProgressManager();

  // Initialize lazy image manager
  initializeLazyImageManager();

  // Initialize keyboard navigation manager
  initializeKeyboardNavigationManager();

  // Initialize menu event manager
  initializeMenuEventManager();

  // Initialize user data manager
  initializeUserDataManager();

  // Initialize project manager
  initializeProjectManager();
  initializeSharedXmlNotice();

  initializeEventListeners();
  // Defer camera detection to not block UI
  setTimeout(() => detectAvailableCameras(), 100);
  // Show no project placeholder initially
  updateNoProjectPlaceholder();
});

// Initialize modal instances
function initializeModals() {
  // Escape presses the cancel button of whichever dialog is on top
  installModalEscape(document);

  newProjectModalInstance = new NewProjectModal({
    showProgressModal: showProgressModal,
    closeProgressModal: closeProgressModal
  });
  newProjectModalInstance.init();

  confirmModalInstance = new ConfirmModal();
  confirmModalInstance.init();

  infoModalInstance = new InfoModal();
  infoModalInstance.init();

  choiceModalInstance = new ChoiceModal();
  choiceModalInstance.init();

  // Notices and questions of the main process, shown with the app's modals
  // instead of the system's message boxes
  appDialogManager = new AppDialogManager({
    infoModal: infoModalInstance,
    choiceModal: choiceModalInstance,
    answer: (id, response) => window.electronAPI.answerAppDialog(id, response)
  });
  window.electronAPI.onAppDialog((request) => appDialogManager.handle(request));

  updateModalInstance = new UpdateModal({
    checkForUpdates: () => window.electronAPI.checkForUpdates(),
    skipUpdateVersion: (version) => window.electronAPI.skipUpdateVersion(version),
    openReleasePage: (version) => window.electronAPI.openReleasePage(version),
    getAppVersion: () => window.electronAPI.getAppVersion(),
    downloadUpdate: () => window.electronAPI.downloadUpdate(),
    installUpdate: () => window.electronAPI.installUpdate(),
    // The same close as Ctrl+W: the project reopens on its own after the
    // restart, being the most recent one
    closeProject: async () => {
      if (projectOpen && projectManager) {
        await projectManager.closeProject();
      }
    },
    isBusy: () => Boolean(progressManager && progressManager.isShowing())
  });
  updateModalInstance.init();

  // Preferencias > Exportación de imágenes, read by both dialogs on opening
  const getExportDefaults = async () => {
    const result = await window.electronAPI.getPreferences();
    return result.success ? result.preferences.exportDefaults : null;
  };

  exportOptionsModalInstance = new ExportOptionsModal({ getDefaults: getExportDefaults });
  exportOptionsModalInstance.init();

  inventoryExportOptionsModalInstance = new InventoryExportOptionsModal({ getDefaults: getExportDefaults });
  inventoryExportOptionsModalInstance.init();

  cropModalInstance = new CropModal();
  cropModalInstance.init();

  addTagModalInstance = new AddTagModal();
  addTagModalInstance.init();

  userImageModalInstance = new UserImageModal();
  // UserImageModal initializes itself in constructor

  photoRosterModalInstance = new PhotoRosterModal();
  photoRosterModalInstance.init();

  restoreBackupModalInstance = new RestoreBackupModal();
  restoreBackupModalInstance.init();

  replacedArchiveModalInstance = new ReplacedArchiveModal();
  replacedArchiveModalInstance.init();

  pendingRequestsModalInstance = new PendingRequestsModal();
  pendingRequestsModalInstance.init();

  exportScopeModalInstance = new ExportScopeModal();
  exportScopeModalInstance.init();

  preferencesModalInstance = new PreferencesModal();
  preferencesModalInstance.init();

  projectInfoModalInstance = new ProjectInfoModal();
  projectInfoModalInstance.init();

  // Ver > Espacios de trabajo
  workspacesModalInstance = new WorkspacesModal({
    api: window.electronAPI,
    confirm: (message) => confirmModalInstance.show(message)
  });
  workspacesModalInstance.init();
  window.electronAPI.onMenuWorkspaces((mode) => workspacesModalInstance.show(mode));
  window.electronAPI.onWorkspacesChanged(() => {
    if (workspacesModalInstance.isModalOpen()) {
      workspacesModalInstance.refresh();
    }
  });

  // Changed from the Proyecto menu while the modal is showing the old folder
  window.electronAPI.onIngestFolderChanged(() => {
    if (projectInfoModalInstance.isModalOpen()) {
      projectInfoModalInstance.refresh();
    }
  });
}

// Initialize user row renderer
function initializeUserRowRenderer() {
  userRowRenderer = new UserRowRenderer({
    showCapturedPhotos: showCapturedPhotos,
    showRepositoryPhotos: showRepositoryPhotos,
    showRepositoryIndicators: showRepositoryIndicators,
    showAdditionalActions: showAdditionalActions,
    isLoadingRepositoryPhotos: isLoadingRepositoryPhotos,
    isLoadingRepositoryIndicators: isLoadingRepositoryIndicators,
    selectionMode: selectionMode,
    selectedUsers: selectedUsers,
    cardPrintRequests: cardPrintRequests,
    publicationRequests: publicationRequests,
    onUserSelect: (row, user) => selectUserRow(row, user),
    onUserContextMenu: (e, user, row) => showContextMenu(e, user, row),
    onImagePreview: (user, type) => showUserImageModal(user, type),
    onCheckboxToggle: (userId, checked) => toggleUserSelection(userId, checked)
  });
}

// Initialize virtual scroll manager
function initializeVirtualScroll() {
  const container = document.getElementById('table-container');
  const tbody = document.getElementById('user-table-body');

  virtualScrollManager = new VirtualScrollManager({
    // Starting estimate only: a row with a photo indicator is 32px plus 12px of
    // padding either side and the bottom border. The manager measures the real
    // height once rows exist, which is what handles rows without indicators.
    itemHeight: 57,
    bufferSize: 10,
    minItemsForVirtualization: 50,
    container: container,
    tbody: tbody,
    createRowCallback: (user) => createUserRow(user, window._imageCountCache || {}),
    observeImagesCallback: () => observeLazyImages()
  });

  virtualScrollManager.init();
}

// ============================================================================
// Ver > Vista de miniaturas
// ============================================================================

function initializeThumbnailGrid() {
  thumbnailGridManager = new ThumbnailGridManager({
    grid: document.getElementById('thumbnail-grid'),
    countEl: document.getElementById('thumbnail-grid-count'),
    sourceButtons: document.getElementById('thumbnail-grid-source'),
    selectAllLabel: document.getElementById('thumbnail-grid-select-all'),
    getSource: () => thumbnailGridSource,
    getSelectionMode: () => selectionMode,
    getSelectedUsers: () => selectedUsers,
    getRepositoryVersion: () => repositoryImageVersion,
    isLoadingRepository: () => isLoadingRepositoryPhotos,
    getShowLinkDate: () => sortByLinkDate,
    // A card is selected exactly like a row
    onUserSelect: (card, user) => selectUserRow(card, user),
    onUserContextMenu: (event, user, card) => showContextMenu(event, user, card),
    onImagePreview: (user, type) => showUserImageModal(user, type),
    onCheckboxToggle: (userId, checked) => toggleUserSelection(userId, checked),
    onSelectAll: (checked) => {
      if (!selectionModeManager) return;
      if (checked) {
        selectionModeManager.selectAll();
      } else {
        selectionModeManager.deselectAll();
      }
    },
    onSourceChange: (source) => setThumbnailGridSource(source),
    observeImages: () => observeLazyImages()
  });
  thumbnailGridManager.init();

  window.electronAPI.onMenuToggleThumbnailGrid((enabled) => {
    showThumbnailGrid = enabled;
    applyUsersViewMode();
  });

  // Also read by MenuEventManager; this listener only takes the grid's part
  window.electronAPI.onInitialDisplayPreferences((prefs) => {
    showThumbnailGrid = Boolean(prefs.showThumbnailGrid);
    thumbnailGridSource = prefs.thumbnailGridSource === 'repository' ? 'repository' : 'captured';
    sortByLinkDate = Boolean(prefs.sortByLinkDate);
    applyUsersViewMode();
  });

  // Only the order changes: the users shown are the same, so no reload. The
  // top is where the point of the new order is
  window.electronAPI.onMenuToggleSortByLinkDate(async (enabled) => {
    sortByLinkDate = enabled;
    await displayUsers(currentUsers, allUsers);
    if (virtualScrollManager) virtualScrollManager.scrollToTop();
    const grid = document.getElementById('thumbnail-grid');
    if (grid) grid.scrollTop = 0;
  });
}

/**
 * The grid only takes the table's place with a project open: without one,
 * the table area holds the "no project" placeholder
 */
function isThumbnailGridActive() {
  return showThumbnailGrid && projectOpen;
}

/**
 * Show the table or the grid, and draw the one that is now visible
 *
 * Only the visible one is kept up to date while the other is hidden, so the
 * switch is where it catches up.
 */
function applyUsersViewMode() {
  const leftPanel = document.querySelector('.left-panel');
  const gridActive = isThumbnailGridActive();
  if (leftPanel) {
    leftPanel.classList.toggle('is-thumbnail-view', gridActive);
  }
  if (!thumbnailGridManager) return;

  if (gridActive) {
    ensureRepositoryDataForGrid();
    thumbnailGridManager.setItems(displayedUsers);
  } else if (virtualScrollManager) {
    // A hidden table cannot measure its rows; it does so again now
    virtualScrollManager.forceRerender();
  }
  restoreSelectedRowHighlight();
}

/**
 * Capturadas | Depósito
 * @param {'captured'|'repository'} source
 */
async function setThumbnailGridSource(source) {
  thumbnailGridSource = source === 'repository' ? 'repository' : 'captured';
  if (isThumbnailGridActive()) {
    // Repaint at once, so the buttons answer the click
    thumbnailGridManager.render();
    restoreSelectedRowHighlight();
  }
  // Waited for: the main process starts the repository copy first, and
  // asking for the repository photos before that finds none
  await window.electronAPI.setThumbnailGridSource(thumbnailGridSource);
  if (ensureRepositoryDataForGrid()) {
    // Spinners until the repository photos arrive
    thumbnailGridManager.render();
    restoreSelectedRowHighlight();
  }
}

/**
 * The repository photos are only looked up when something shows them; the
 * grid on its repository source is one of those things
 * @returns {boolean} whether a lookup started
 */
function ensureRepositoryDataForGrid() {
  if (!isThumbnailGridActive() || thumbnailGridSource !== 'repository' || currentUsers.length === 0) {
    return false;
  }
  if (isLoadingRepositoryPhotos || currentUsers.some(user => user.repository_image_path)) {
    return false;
  }
  isLoadingRepositoryPhotos = true;
  loadRepositoryDataInBackground(currentUsers);
  return true;
}

// ============================================================================
// Turning captured photos
// ============================================================================

const INCOMING_ROTATION_LABELS = { 90: '90° a la derecha', 180: '180°', 270: '90° a la izquierda' };

function initializeImageRotation() {
  const buttons = [
    [document.getElementById('rotate-image-left'), -90],
    [document.getElementById('rotate-image-right'), 90]
  ];
  buttons.forEach(([button, degrees]) => {
    if (button) {
      button.addEventListener('click', () => rotateCurrentImage(degrees, buttons.map(([b]) => b)));
    }
  });

  window.electronAPI.onIncomingRotationChanged((degrees) => {
    incomingRotation = degrees || 0;
    updateIncomingRotationBadge();
  });

  window.electronAPI.onCapturedImageRewritten(({ imagePath }) => applyImageRewrite(imagePath));
}

/**
 * Turn the photo on show in the viewer
 * @param {number} degrees - 90 to the right, -90 to the left
 * @param {HTMLElement[]} buttons - kept disabled until it is done
 */
async function rotateCurrentImage(degrees, buttons) {
  const imagePath = imageGridManager ? imageGridManager.getCurrentImagePath() : null;
  if (!imagePath) return;

  buttons.forEach((button) => { if (button) button.disabled = true; });
  try {
    const result = await window.electronAPI.rotateCapturedImage(imagePath, degrees);
    if (!result.success) {
      showInfoModal('No se pudo girar la foto', result.error);
    }
    // The views are refreshed by 'captured-image-rewritten', sent to every window
  } finally {
    buttons.forEach((button) => { if (button) button.disabled = false; });
  }
}

// ============================================================================
// Cropping captured photos (the viewer's context menu)
// ============================================================================

function initializeViewerContextMenu() {
  const container = document.getElementById('image-preview-container');
  if (!container) return;

  container.addEventListener('contextmenu', (event) => {
    // Over the photo only, not the buttons laid on it
    if (event.target && event.target.id !== 'current-image') return;
    const imagePath = imageGridManager ? imageGridManager.getCurrentImagePath() : null;
    if (!imagePath) return;

    event.preventDefault();
    showViewerContextMenu(event, imagePath);
  });
}

/**
 * Recortar..., and Restaurar original when the photo was cropped before
 * @param {MouseEvent} event
 * @param {string} imagePath
 */
async function showViewerContextMenu(event, imagePath) {
  document.querySelectorAll('.context-menu').forEach((menu) => menu.remove());

  // Asked before drawing, so the menu does not grow under the pointer
  const source = await window.electronAPI.getCapturedImageCropSource(imagePath);
  if (!source.success) {
    showInfoModal('No se puede recortar la foto', source.error);
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.position = 'fixed';

  const close = () => {
    menu.remove();
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKeyDown);
  };
  const onOutsideClick = (e) => { if (!menu.contains(e.target)) close(); };
  const onKeyDown = (e) => { if (e.key === 'Escape') close(); };

  const options = [['Recortar...', () => cropImage(imagePath, source)]];
  if (source.hasOriginal) {
    options.push(['Restaurar original', () => restoreImageOriginal(imagePath)]);
  }
  options.forEach(([label, action]) => {
    const option = document.createElement('div');
    option.className = 'context-menu-item';
    option.textContent = label;
    option.addEventListener('click', () => {
      close();
      action();
    });
    menu.appendChild(option);
  });

  document.body.appendChild(menu);

  // Near the right or bottom edge, open towards the inside of the window
  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - width))}px`;
  menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - height))}px`;

  setTimeout(() => {
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKeyDown);
  }, 0);
}

/**
 * Ask for the rectangle and crop the photo with it
 * @param {string} imagePath
 * @param {{sourcePath: string, width: number, height: number, hasOriginal: boolean}} source
 */
async function cropImage(imagePath, source) {
  const rect = await cropModalInstance.show({
    // Its own version: the original may have been turned since it was last
    // drawn, and nothing else shows it
    url: imageUrl.original(source.sourcePath, Date.now()),
    width: source.width,
    height: source.height,
    hasOriginal: source.hasOriginal
  });
  if (!rect) return;

  const result = await window.electronAPI.cropCapturedImage(imagePath, rect);
  if (!result.success) {
    showInfoModal('No se pudo recortar la foto', result.error);
  }
  // The views are refreshed by 'captured-image-rewritten'
}

/**
 * Undo the crops of a photo
 * @param {string} imagePath
 */
async function restoreImageOriginal(imagePath) {
  const result = await window.electronAPI.restoreCapturedImage(imagePath);
  if (!result.success) {
    showInfoModal('No se pudo restaurar la foto original', result.error);
  }
}

/**
 * A photo was turned, cropped or restored: every view of it loads it again
 * @param {string} imagePath
 */
function applyImageRewrite(imagePath) {
  imageUrl.bumpVersion(imagePath);

  if (imageGridManager) {
    imageGridManager.refreshCurrentImage();
    publishViewerImage();
  }
  if (captureHistoryManager) {
    captureHistoryManager.refreshThumbnail(imagePath);
  }
  // The list's and the grid's thumbnails of whoever has it linked
  if (projectOpen) {
    displayUsers(currentUsers, allUsers);
  }
}

function updateIncomingRotationBadge() {
  const badge = document.getElementById('incoming-rotation-badge');
  if (!badge) return;
  const label = INCOMING_ROTATION_LABELS[incomingRotation];
  badge.hidden = !(projectOpen && label);
  badge.textContent = label ? `Fotos entrantes giradas ${label}` : '';
  badge.title = 'Las fotos que lleguen a la carpeta de entrada se giran solas. Se cambia en Proyecto > Girar las fotos entrantes.';
}

/**
 * Tell Ver > Visor en ventana aparte what the viewer shows. The URL goes
 * built, with the version a turned photo carries, so the other window loads
 * exactly what this one does
 */
function publishViewerImage() {
  const imagePath = imageGridManager && imageGridManager.isPreviewActive()
    ? imageGridManager.getCurrentImagePath()
    : null;
  window.electronAPI.setViewerImage(imagePath ? { path: imagePath, url: imageUrl.original(imagePath) } : null);
}

// Initialize image grid manager
function initializeImageGridManager() {
  imageGridManager = new ImageGridManager({
    imagePreviewContainer: imagePreviewContainer,
    currentImage: currentImage,
    getImages: () => window.electronAPI.getImages(),
    onImageChange: async (imagePath) => {
      publishViewerImage();
      // Load and display tags for current image
      await loadImageTags();
      // Update link button state
      updateLinkButtonState();
      // Keep the history strip pointing at whatever the viewer shows
      if (captureHistoryManager) {
        captureHistoryManager.setCurrentIndex(imageGridManager.getCurrentIndex());
      }
    },
    onImagesLoaded: (images, currentIndex) => {
      // An emptied list reports no image change, and the viewer is left blank
      if (images.length === 0) {
        publishViewerImage();
      }
      if (captureHistoryManager) {
        captureHistoryManager.render(images, currentIndex);
      }
    }
  });

}

// Initialize capture history strip
function initializeCaptureHistoryManager() {
  captureHistoryManager = new CaptureHistoryManager({
    panel: captureHistoryPanel,
    list: captureHistoryList,
    empty: captureHistoryEmpty,
    thumbnailSize: window.imageUrl.INDICATOR_SIZE,
    onSelect: (index) => {
      // Moving the viewer's cursor is all this does; the selection then behaves
      // exactly as if the arrows had been used
      if (imageGridManager) {
        imageGridManager.showImageAtIndex(index);
      }
    }
  });

  captureHistoryManager.init();
  captureHistoryManager.setVisible(showCaptureHistory);
}

// Initialize export manager
function initializeExportManager() {
  exportManager = new ExportManager({
    exportOptionsModal: exportOptionsModalInstance,
    exportScopeModal: exportScopeModalInstance,
    inventoryExportOptionsModal: inventoryExportOptionsModalInstance,
    confirmModal: confirmModalInstance,
    showProgressModal: showProgressModal,
    closeProgressModal: closeProgressModal,
    showInfoModal: showInfoModal,
    // Every dialog these managers open picks an export destination
    showOpenDialog: (options) => window.electronAPI.selectExportFolder(options),
    getProjectOpen: () => projectOpen,
    getSelectionMode: () => selectionMode,
    getSelectedUsers: () => selectedUsers,
    getDisplayedUsers: () => displayedUsers,
    getCurrentUsers: () => currentUsers,
    // Every user of the project, for the "todos los usuarios" scope
    getAllUsers: () => allUsers,
    getShowDuplicatesOnly: () => showDuplicatesOnly,
    getShowCardPrintRequestsOnly: () => showCardPrintRequestsOnly,
    getShowPublicationRequestsOnly: () => showPublicationRequestsOnly,
    getCurrentFilters: getCurrentFilters,
    getGroupFilter: () => groupFilter.value,
    // The label as it reads in the filter, so the dialog names the group the
    // same way the screen does
    getGroupFilterLabel: () => {
      const option = groupFilter.options[groupFilter.selectedIndex];
      return option ? option.text : '';
    },
    getSearchTerm: () => searchInput.value.trim(),
    onExportComplete: async () => {
      // Reload users to refresh the repository check indicators
      await loadUsers(getCurrentFilters());
    },
    electronAPI: window.electronAPI
  });

}

// Initialize orla export manager
function initializeOrlaExportManager() {
  orlaExportManager = new OrlaExportManager({
    showProgressModal: showProgressModal,
    closeProgressModal: closeProgressModal,
    showInfoModal: showInfoModal,
    // Every dialog these managers open picks an export destination
    showOpenDialog: (options) => window.electronAPI.selectExportFolder(options),
    getProjectOpen: () => projectOpen,
    getAllUsers: () => allUsers,
    getAllGroups: () => currentGroups,
    onExportComplete: () => {
      // Orla export doesn't need to reload users
    },
    electronAPI: window.electronAPI
  });

}

function initializePhotoRosterExportManager() {
  photoRosterExportManager = new PhotoRosterExportManager({
    photoRosterModal: photoRosterModalInstance,
    showProgressModal: showProgressModal,
    closeProgressModal: closeProgressModal,
    showInfoModal: showInfoModal,
    showOpenDialog: (options) => window.electronAPI.selectExportFolder(options),
    getProjectOpen: () => projectOpen,
    getAllUsers: () => allUsers,
    getAllGroups: () => currentGroups,
    electronAPI: window.electronAPI
  });
}

// Initialize image tags manager
function initializeImageTagsManager() {
  imageTagsManager = new ImageTagsManager({
    addTagModal: addTagModalInstance,
    confirmModal: confirmModalInstance,
    showInfoModal: showInfoModal,
    imageGridManager: imageGridManager,
    getProjectOpen: () => projectOpen,
    electronAPI: window.electronAPI,
    tagsContainer: document.getElementById('image-tags-container'),
    tagsList: document.getElementById('image-tags-list'),
    taggedImagesModal: document.getElementById('tagged-images-modal'),
    taggedImagesContainer: document.getElementById('tagged-images-container'),
    taggedImagesCloseBtn: document.getElementById('tagged-images-close-btn')
  });

}

// Initialize selection mode manager
function initializeSelectionModeManager() {
  selectionModeManager = new SelectionModeManager({
    onSelectionChange: (isActive, selected) => {
      // Sync with global state for backward compatibility
      selectionMode = isActive;
      selectedUsers = selected;

      // Rows read this from the config, so setting the properties directly
      // would have no effect on what gets rendered
      syncUserRowRendererConfig();
    },
    getDisplayedUsers: () => displayedUsers,
    reRenderUsers: () => {
      // Force re-render to update checkboxes when selection mode changes
      syncUserRowRendererConfig();

      if (virtualScrollManager) {
        virtualScrollManager.forceRerender();
      } else {
        displayUsers(currentUsers, allUsers);
      }
      if (isThumbnailGridActive() && thumbnailGridManager) {
        thumbnailGridManager.render();
      }

      restoreSelectedRowHighlight();
    },
    syncCheckboxes: (selected) => {
      if (!userTableBody) return;

      // Ticking boxes does not change anything else about a row, so the rows
      // are updated in place instead of being rebuilt
      userTableBody.querySelectorAll('tr[data-user-id]').forEach(row => {
        const checkbox = row.querySelector('.user-checkbox');
        if (checkbox) {
          checkbox.checked = selected.has(Number(row.dataset.userId));
        }
      });
      if (thumbnailGridManager) {
        thumbnailGridManager.syncCheckboxes(selected);
      }
    },
    onRequestCardPrint: handleRequestCardPrint,
    onRequestPublication: handleRequestPublication,
    onUnpayOrla: handleUnpayOrla,
    onUnprintReceipt: handleUnprintReceipt,
    getOrlaEnabled: () => orlaEnabled,
    selectedUserInfo: selectedUserInfo,
    tableHeader: document.querySelector('.user-table thead tr')
  });

}

// Initialize drag and drop manager
function initializeDragDropManager() {
  dragDropManager = new DragDropManager({
    dropZone: document.querySelector('.image-container'),
    showInfoModal: showInfoModal,
    moveImageToIngest: (path) => window.electronAPI.moveImageToIngest(path),
    getPathForFile: (file) => window.electronAPI.getPathForFile(file)
  });

  dragDropManager.enable();
}

// Initialize progress manager
function initializeProgressManager() {
  progressManager = new ProgressManager({
    modal: progressModal,
    electronAPI: window.electronAPI
  });

  progressManager.setupListener();
}

// Initialize lazy image manager
function initializeLazyImageManager() {
  lazyImageManager = new LazyImageManager();
  lazyImageManager.init();
}

// Initialize keyboard navigation manager
function initializeKeyboardNavigationManager() {
  keyboardNavigationManager = new KeyboardNavigationManager({
    onNavigateUserPrev: () => navigateUsers(-1),
    onNavigateUserNext: () => navigateUsers(1),
    onNavigateImagePrev: () => {
      if (imageGridManager) {
        imageGridManager.previous();
      }
    },
    onNavigateImageNext: () => {
      if (imageGridManager) {
        imageGridManager.next();
      }
    },
    // isModalOpen is left to the manager, which checks for any open dialog
    hasImages: () => imageGridManager && imageGridManager.getImageCount() > 0
  });

  keyboardNavigationManager.enable();
}

// Initialize menu event manager
function initializeMenuEventManager() {
  menuEventManager = new MenuEventManager({
    // State setters
    setShowDuplicatesOnly: (value) => {
      showDuplicatesOnly = value;
      updateAlertBadges(); // Update badge visibility when filter changes
    },
    setShowCardPrintRequestsOnly: (value) => {
      showCardPrintRequestsOnly = value;
      updateAlertBadges(); // Update badge visibility when filter changes
    },
    setShowPublicationRequestsOnly: (value) => {
      showPublicationRequestsOnly = value;
      updateAlertBadges(); // Update badge visibility when filter changes
    },
    setShowCapturedPhotos: (value) => { showCapturedPhotos = value; },
    setShowRepositoryPhotos: (value) => { showRepositoryPhotos = value; },
    setShowRepositoryIndicators: (value) => { showRepositoryIndicators = value; },
    setShowAdditionalActions: (value) => { showAdditionalActions = value; },
    setOrlaEnabled: (value) => { orlaEnabled = value; },
    setShowCaptureHistory: (value) => { showCaptureHistory = value; },
    setIsLoadingRepositoryPhotos: (value) => { isLoadingRepositoryPhotos = value; },
    setIsLoadingRepositoryIndicators: (value) => { isLoadingRepositoryIndicators = value; },
    setRepositorySyncCompleted: (value) => { repositorySyncCompleted = value; },
    setProjectOpen: (value) => {
      projectOpen = value;
      applyUsersViewMode();
      updateIncomingRotationBadge();
    },

    // State getters
    getCurrentUsers: () => currentUsers,
    getAllUsers: () => allUsers,
    getCurrentFilters: getCurrentFilters,

    // Action callbacks
    onNewProject: openNewProjectModal,
    onOpenProject: handleOpenProject,
    onCloseProject: handleCloseProject,
    onProjectLoaded: loadProjectData,
    onLinkImage: handleLinkImage,
    onDeletePhoto: handleDeletePhoto,
    onImportImagesId: handleImportImagesId,
    onExportCSV: handleExportCSV,
    onExportInventoryCSV: handleExportInventoryCSV,
    onExportImages: handleExportImages,
    onExportRepositoryImages: handleExportRepositoryImages,
    onExportImagesName: handleExportImagesName,
    onExportToRepository: handleExportToRepository,
    onExportPhotoRosterPDF: handleExportPhotoRosterPDF,
    onExportPaidOrlaPDF: handleExportPaidOrlaPDF,
    onExportPaidUsersCSV: handleExportPaidUsersCSV,
    onOrlaPay: handlePayOrla,
    onOrlaPrintReceipt: handlePrintReceipt,
    onOrlaSettings: () => handlePreferences('orla'),
    onExportMissingRepositoryPhotosPDF: handleExportMissingRepositoryPhotosPDF,
    onExportMissingCapturedPhotosPDF: handleExportMissingCapturedPhotosPDF,
    onExportGroupCoveragePDF: handleExportGroupCoveragePDF,
    onUpdateXML: handleUpdateXML,
    onShowProjectInfo: handleShowProjectInfo,
    onAddImageTag: handleAddImageTag,
    onShowTaggedImages: handleShowTaggedImages,

    // Display callbacks
    onDisplayUsers: displayUsers,
    onUpdatePhotosColumnVisibility: updatePhotosColumnVisibility,
    onUpdateUserRowRenderer: updateUserRowRendererConfig,
    onLoadUsers: loadUsers,
    onLoadRepositoryData: loadRepositoryDataInBackground,
    onToggleCaptureHistory: (enabled) => {
      if (captureHistoryManager) {
        captureHistoryManager.setVisible(enabled);
      }
    },

    // DOM elements
    additionalActionsSection: document.querySelector('.additional-actions'),

    // IPC API
    electronAPI: window.electronAPI
  });

  menuEventManager.init();
}

// Initialize user data manager
function initializeUserDataManager() {
  userDataManager = new UserDataManager({
    // State setters
    setCurrentUsers: (users) => { currentUsers = users; },
    setAllUsers: (users) => { allUsers = users; },
    setCurrentGroups: (groups) => { currentGroups = groups; },
    setIsLoadingRepositoryPhotos: (value) => { isLoadingRepositoryPhotos = value; },
    setIsLoadingRepositoryIndicators: (value) => { isLoadingRepositoryIndicators = value; },
    setRepositorySyncCompleted: (value) => { repositorySyncCompleted = value; },

    // State getters
    getCurrentUsers: () => currentUsers,
    getAllUsers: () => allUsers,
    getCurrentGroups: () => currentGroups,
    getShowCapturedPhotos: () => showCapturedPhotos,
    // The grid on its repository source needs the same data the column does
    getShowRepositoryPhotos: () => showRepositoryPhotos ||
      (isThumbnailGridActive() && thumbnailGridSource === 'repository'),
    getShowRepositoryIndicators: () => showRepositoryIndicators,

    // Callbacks
    onDisplayUsers: displayUsers,
    onUpdateUserCount: updateUserCount,
    onUpdateCardPrintRequests: (requests) => {
      cardPrintRequests = requests;
      updateAlertBadges();
    },
    onUpdatePublicationRequests: (requests) => {
      publicationRequests = requests;
      updateAlertBadges();
    },
    onUpdateUserRowRenderer: (config) => {
      if (userRowRenderer) {
        userRowRenderer.updateConfig(config);
      }
    },

    // DOM elements
    groupFilter: groupFilter,
    loadingSpinner: loadingSpinner,
    noProjectPlaceholder: noProjectPlaceholder,
    userTableBody: userTableBody,

    // IPC API
    electronAPI: window.electronAPI
  });

}

// Notice of a more recent school XML published by another team
let sharedXmlNotice = null;

function initializeSharedXmlNotice() {
  sharedXmlNotice = new SharedXmlNotice({
    badge: document.getElementById('shared-xml-alert'),
    getProjectOpen: () => projectOpen,
    onUpdate: (published) => projectManager.handleUpdateXML(published)
  });
  sharedXmlNotice.init();

  // Another team may publish while this one works: look again on coming back
  // to the window (the main process reads Centro once a minute at most)
  window.addEventListener('focus', () => sharedXmlNotice.check());
}

function initializeProjectManager() {
  projectManager = new ProjectManager({
    // State setters
    setProjectOpen: (value) => {
      projectOpen = value;
      applyUsersViewMode();
      updateIncomingRotationBadge();
      if (!value && sharedXmlNotice) sharedXmlNotice.hide();
    },
    setCurrentUsers: (users) => { currentUsers = users; },
    setAllUsers: (users) => { allUsers = users; },
    setCurrentGroups: (groups) => { currentGroups = groups; },
    setSelectedUser: (user) => { selectedUser = user; },

    // State getters
    getProjectOpen: () => projectOpen,

    // Callbacks
    onLoadGroups: loadGroups,
    onLoadUsers: loadUsers,
    onLoadImages: loadImages,
    onClearImages: clearImages,
    onUpdateStatusBar: updateStatusBar,
    onUpdateWindowTitle: updateWindowTitle,
    onGetCurrentFilters: getCurrentFilters,
    onShowInfoModal: showInfoModal,
    onShowConfirmModal: showConfirmationModal,
    onShowProgressModal: showProgressModal,
    onCloseProgressModal: closeProgressModal,
    onUpdateLastFilterValue: updateLastFilterValue,
    onResetGroupFilterLock: resetGroupFilterLock,
    onProjectDataLoaded: () => { if (sharedXmlNotice) sharedXmlNotice.check(); },

    // DOM elements
    searchInput: searchInput,
    groupFilter: groupFilter,
    noProjectPlaceholder: noProjectPlaceholder,

    // Modal instances
    newProjectModal: newProjectModalInstance,

    // IPC API
    electronAPI: window.electronAPI
  });

}

// Group filter state (needs to be accessible from ProjectManager)
let lastFilterValue = groupFilter.value; // Track last value to detect actual changes

// Function to update lastFilterValue when filter is programmatically changed
function updateLastFilterValue(value) {
  lastFilterValue = value;
}

// Search debounce: each search reloads the user list over IPC and repaints the
// table, so keystrokes are coalesced instead of triggering one reload each
const SEARCH_DEBOUNCE_MS = 250;
let searchDebounceTimer = null;

function cancelPendingSearch() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
}

// A search looks across every group, so while there is one the group filter
// shows "Todos los grupos" and is locked; the group chosen before is kept here
// (null when not searching) and restored once the search is cleared. It is not
// saved or broadcast: the other windows keep following the chosen group.
let groupBeforeSearch = null;

function syncGroupFilterWithSearch() {
  const searching = searchInput.value.trim() !== '';
  if (searching && groupBeforeSearch === null) {
    groupBeforeSearch = groupFilter.value;
    groupFilter.value = '';
    groupFilter.disabled = true;
  } else if (!searching && groupBeforeSearch !== null) {
    groupFilter.value = groupBeforeSearch;
    // The group may be gone after an XML update; fall back to all groups
    if (groupFilter.value !== groupBeforeSearch) groupFilter.value = '';
    lastFilterValue = groupFilter.value;
    groupBeforeSearch = null;
    groupFilter.disabled = false;
  }
}

// The project was closed with a search in place: forget the saved group
function resetGroupFilterLock() {
  groupBeforeSearch = null;
  groupFilter.disabled = false;
}

// Event Listeners
function initializeEventListeners() {
  // Search and filter
  searchInput.addEventListener('input', () => {
    toggleClearButton();
    cancelPendingSearch();
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      syncGroupFilterWithSearch();
      filterUsers();
    }, SEARCH_DEBOUNCE_MS);
  });
  clearSearchBtn.addEventListener('click', clearSearch);

  groupFilter.addEventListener('change', async () => {
    const newValue = groupFilter.value;

    // Only process if value actually changed
    if (newValue === lastFilterValue) {
      return;
    }

    lastFilterValue = newValue;

    // Save filter selection and broadcast to other windows
    await window.electronAPI.setSelectedGroupFilter(newValue);
    cancelPendingSearch();
    await filterUsers();
  });

  // Previous or next group with the wheel over the filter or Alt+↑/↓
  groupFilterStepper.attachGroupFilterStepper(groupFilter);

  // Listen for group filter changes from other windows
  window.electronAPI.onGroupFilterChanged(async (groupCode) => {
    // During a search the filter is locked on all groups: the new group is
    // the one to come back to
    if (groupBeforeSearch !== null) {
      groupBeforeSearch = groupCode;
      return;
    }
    // Only update if the value is actually different to avoid unnecessary reloads
    if (groupFilter.value !== groupCode) {
      lastFilterValue = groupCode;
      groupFilter.value = groupCode;
      await filterUsers();
    }
  });

  // Listen for card print requests filter toggle from menu
  window.electronAPI.onMenuToggleCardPrintRequests((enabled) => {
    showCardPrintRequestsOnly = enabled;
    // Exclusive filter: disable others when this is enabled
    if (enabled) {
      showDuplicatesOnly = false;
      showPublicationRequestsOnly = false;
    }
    updateAlertBadges(); // Update badge visibility based on filter state
    displayUsers(currentUsers, allUsers);
  });

  // Listen for publication requests filter toggle from menu
  window.electronAPI.onMenuTogglePublicationRequests((enabled) => {
    showPublicationRequestsOnly = enabled;
    // Exclusive filter: disable others when this is enabled
    if (enabled) {
      showDuplicatesOnly = false;
      showCardPrintRequestsOnly = false;
    }
    updateAlertBadges(); // Update badge visibility based on filter state
    displayUsers(currentUsers, allUsers);
  });

  // Alert badge click handlers
  // Note: We only send IPC to main, which will update menu and send back the new state
  if (cardPrintAlert) {
    cardPrintAlert.addEventListener('click', () => {
      const newValue = !showCardPrintRequestsOnly;
      if (menuEventManager) {
        menuEventManager.triggerCardPrintRequestsFilter(newValue);
      }
    });
  }

  if (publicationAlert) {
    publicationAlert.addEventListener('click', () => {
      const newValue = !showPublicationRequestsOnly;
      if (menuEventManager) {
        menuEventManager.triggerPublicationRequestsFilter(newValue);
      }
    });
  }

  if (duplicatesAlert) {
    duplicatesAlert.addEventListener('click', () => {
      const newValue = !showDuplicatesOnly;
      if (menuEventManager) {
        menuEventManager.triggerDuplicatesFilter(newValue);
      }
    });
  }

  // Action buttons
  linkBtn.addEventListener('click', handleLinkImage);

  if (payOrlaBtn) {
    payOrlaBtn.addEventListener('click', handlePayOrla);
  }

  if (importReceiptBtn) {
    importReceiptBtn.addEventListener('click', handlePrintReceipt);
  }

  // Image navigation
  prevImageBtn.addEventListener('click', () => {
    if (imageGridManager) {
      imageGridManager.previous();
    }
  });
  nextImageBtn.addEventListener('click', () => {
    if (imageGridManager) {
      imageGridManager.next();
    }
  });

  // Note: Modal buttons (new project, confirm, info) are handled by modal classes

  // Variable to track blinking interval
  let blinkInterval = null;

  // Listen for image being processed (before it's copied)
  window.electronAPI.onImageDetecting((filename) => {
    // Start blinking the image preview container
    if (!blinkInterval) {
      blinkInterval = setInterval(() => {
        if (imageGridManager) {
          imageGridManager.setDetecting(true);
        }
        setTimeout(() => {
          if (imageGridManager) {
            imageGridManager.setDetecting(false);
          }
        }, 150);
      }, 300); // Blink every 300ms
    }
  });

  const stopBlinking = () => {
    if (blinkInterval) {
      clearInterval(blinkInterval);
      blinkInterval = null;
      if (imageGridManager) {
        imageGridManager.setDetecting(false);
      }
    }
  };

  // A photo announced as being processed that will not be imported, for
  // instance because it is over 5 MB: the viewer used to keep blinking
  window.electronAPI.onImageRejected(async ({ message }) => {
    stopBlinking();
    if (message) {
      await showInfoModal('Foto no importada', message);
    }
  });

  // Listen for new images (after processing is complete)
  window.electronAPI.onNewImageDetected(async (filename) => {
    stopBlinking();

    if (imageGridManager) {
      await imageGridManager.loadImages(true);
    }
  });

  // Listen for repository changes
  window.electronAPI.onRepositoryChanged(async (data) => {
    // Mark repository sync as completed
    repositorySyncCompleted = true;

    // Invalidate cached repository images before anything re-renders
    repositoryImageVersion++;
    if (userRowRenderer) {
      userRowRenderer.updateConfig({ repositoryVersion: repositoryImageVersion });
    }

    // Refresh only repository indicators to preserve scroll position
    if (userDataManager && userRowRenderer) {
      await userDataManager.refreshRepositoryIndicators((updatedUsers) => {
        // Update repository indicators in existing rows
        userRowRenderer.updateRepositoryIndicators(userTableBody, updatedUsers);
        // The grid's repository photos carry the version in their URLs
        if (isThumbnailGridActive() && thumbnailGridSource === 'repository') {
          thumbnailGridManager.render();
          restoreSelectedRowHighlight();
        }
        // Trigger lazy image observation for new repository images
        if (lazyImageManager) {
          lazyImageManager.observeAll();
        }
      });
    } else {
      // Fallback to full reload if managers not initialized
      const filters = getCurrentFilters();
      await loadUsers(filters);
    }
  });

  // Listen for repository path changes
  window.electronAPI.onRepositoryPathChanged(async () => {
    // Update status bar to reflect the new repository path
    await updateStatusBar();
    // The new repository may hold a more recent school XML
    if (sharedXmlNotice) sharedXmlNotice.check();
  });

  // About modal
  const aboutModal = document.getElementById('about-modal');
  const aboutVersionEl = document.getElementById('about-version');
  const aboutCloseBtn = document.getElementById('about-close-btn');

  // Listen for menu event to show about modal
  window.electronAPI.onMenuShowAbout(async () => {
    // Get and display version
    const version = await window.electronAPI.getAppVersion();
    aboutVersionEl.textContent = `Versión ${version}`;

    // Show modal
    aboutModal.classList.add('show');
  });

  // Updates: the Help menu asks for a manual check, and the main process
  // reports every outcome (including automatic checks) through update-status
  window.electronAPI.onMenuCheckUpdates(() => {
    updateModalInstance.checkNow();
  });
  window.electronAPI.onUpdateStatus((payload) => {
    updateModalInstance.handleStatus(payload);
  });
  const aboutCheckUpdatesBtn = document.getElementById('about-check-updates-btn');
  if (aboutCheckUpdatesBtn) {
    aboutCheckUpdatesBtn.addEventListener('click', () => {
      aboutModal.classList.remove('show');
      updateModalInstance.checkNow();
    });
  }

  // Close about modal
  if (aboutCloseBtn) {
    aboutCloseBtn.addEventListener('click', () => {
      aboutModal.classList.remove('show');
    });
  }

  // Close on backdrop click
  aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) {
      aboutModal.classList.remove('show');
    }
  });

  // Listen for restore image links menu event
  window.electronAPI.onMenuRestoreImageLinks(async () => {
    await handleRestoreImageLinks();
  });

  // Proyecto > Purgar fotos reemplazadas
  window.electronAPI.onMenuPurgeReplacedArchive(async () => {
    await handlePurgeReplacedArchive();
  });

  // Proyecto > Revisar solicitudes pendientes
  window.electronAPI.onMenuReviewPendingRequests(async () => {
    await handleReviewPendingRequests();
  });

  // Listen for preferences menu event
  window.electronAPI.onMenuPreferences(async () => {
    await handlePreferences();
  });

  // Keyboard navigation is now handled by KeyboardNavigationManager
}

// Project management - delegates to ProjectManager
async function openNewProjectModal() {
  if (projectManager) {
    await projectManager.openNewProject();
  }
}

async function handleOpenProject() {
  if (projectManager) {
    await projectManager.openExistingProject();
  }
}

async function handleCloseProject() {
  if (projectManager) {
    await projectManager.closeProject();
  }
}

async function loadProjectData() {
  if (projectManager) {
    await projectManager.loadProjectData();
  }
}

function updateNoProjectPlaceholder() {
  if (projectManager) {
    projectManager.updateNoProjectPlaceholder();
  }
}

async function loadGroups() {
  if (userDataManager) {
    await userDataManager.loadGroups();
  }
}

async function loadUsers(filters = {}, options = {}) {
  if (userDataManager) {
    await userDataManager.loadUsers(filters, options);
    // Update linked photos count after loading users
    await updateCapturedPhotosCount();
  }
}

async function loadRepositoryDataInBackground(users) {
  if (userDataManager) {
    await userDataManager.loadRepositoryDataInBackground(users);
  }
}

function updateRepositoryDataInDisplay() {
  if (userDataManager) {
    userDataManager.updateRepositoryDataInDisplay();
  }
}

/**
 * Count how many users share each captured photo
 *
 * A count above one is what marks a row as a duplicate.
 *
 * @param {Array} users
 * @returns {Object<string, number>} Image path -> number of users linked to it
 */
function countImageUsage(users) {
  const imageCount = {};
  users.forEach(user => {
    if (user.image_path) {
      imageCount[user.image_path] = (imageCount[user.image_path] || 0) + 1;
    }
  });
  return imageCount;
}

/**
 * Tell the history strip which captures are linked, and to whom
 *
 * Built from every user of the project, not the filtered list: a photo is
 * linked whether or not its owner is on screen.
 *
 * @param {Array} users
 */
function updateCaptureHistoryLinks(users) {
  if (!captureHistoryManager) return;

  const linksByPath = new Map();
  users.forEach(user => {
    if (!user.image_path) return;
    const surnames = [user.last_name1, user.last_name2].filter(Boolean).join(' ');
    const name = surnames ? `${surnames}, ${user.first_name || ''}`.trim() : (user.first_name || '');
    if (!linksByPath.has(user.image_path)) {
      linksByPath.set(user.image_path, []);
    }
    linksByPath.get(user.image_path).push(name);
  });

  captureHistoryManager.setLinks(linksByPath);
}

async function displayUsers(users, allUsers = null) {
  // If checking for duplicates, we need to count against all users in database
  const usersForCounting = allUsers || users;

  // Check for duplicate images
  const imageCount = countImageUsage(usersForCounting);

  // Note: Duplicates filter is now managed via badge, not checkbox

  // Apply filters
  let usersToDisplay = users;
  if (showDuplicatesOnly && allUsers) {
    // Show all users with duplicates from the entire database
    usersToDisplay = allUsers.filter(user => user.image_path && imageCount[user.image_path] > 1);
  } else if (showDuplicatesOnly) {
    // Fallback if allUsers not available
    usersToDisplay = users.filter(user => user.image_path && imageCount[user.image_path] > 1);
  } else if (showCardPrintRequestsOnly) {
    // Show only users with pending card print requests (ignore group filter)
    const sourceUsers = allUsers || users;
    usersToDisplay = sourceUsers.filter(user => {
      const userId = user.type === 'student' ? user.nia : user.document;
      return userId && cardPrintRequests.has(userId);
    });
  } else if (showPublicationRequestsOnly) {
    // Show only users with pending publication requests (ignore group filter)
    const sourceUsers = allUsers || users;
    usersToDisplay = sourceUsers.filter(user => {
      const userId = user.type === 'student' ? user.nia : user.document;
      return userId && publicationRequests.has(userId);
    });
  }

  if (sortByLinkDate) {
    usersToDisplay = linkDate.sortUsers(usersToDisplay);
  }

  // Store displayed users and image count for virtual scrolling
  displayedUsers = usersToDisplay;

  // Store imageCount globally for row rendering
  window._imageCountCache = imageCount;

  updateCaptureHistoryLinks(usersForCounting);

  // Once for the whole batch rather than once per row
  syncUserRowRendererConfig();

  // Use virtual scroll manager to render users
  if (virtualScrollManager) {
    virtualScrollManager.setItems(displayedUsers);
  }

  if (isThumbnailGridActive() && thumbnailGridManager) {
    thumbnailGridManager.setItems(displayedUsers);
  }

  restoreSelectedRowHighlight();
}

/**
 * Push the current display state into the row renderer
 *
 * Rows read this while being built, so it has to be current before a render
 * starts. Doing it here means one object per batch instead of one per row.
 */
function syncUserRowRendererConfig() {
  if (!userRowRenderer) return;

  userRowRenderer.updateConfig({
    showCapturedPhotos: showCapturedPhotos,
    showRepositoryPhotos: showRepositoryPhotos,
    showRepositoryIndicators: showRepositoryIndicators,
    showAdditionalActions: showAdditionalActions,
    isLoadingRepositoryPhotos: isLoadingRepositoryPhotos,
    isLoadingRepositoryIndicators: isLoadingRepositoryIndicators,
    selectionMode: selectionMode,
    selectedUsers: selectedUsers,
    showLinkDate: sortByLinkDate
  });
}

/**
 * Re-mark the selected row after a render
 *
 * Rows are rebuilt from scratch, so the highlight would otherwise disappear
 * whenever anything refreshed the table under the user.
 */
function restoreSelectedRowHighlight() {
  if (!selectedUser) return;

  if (isThumbnailGridActive() && thumbnailGridManager) {
    const card = thumbnailGridManager.getCard(selectedUser.id);
    if (card) {
      card.classList.add('selected');
      selectedRowElement = card;
    }
    return;
  }

  if (!userTableBody) return;

  const row = userTableBody.querySelector(`tr[data-user-id="${selectedUser.id}"]`);
  if (row) {
    row.classList.add('selected');
    selectedRowElement = row;
  }
}

// Create a user row element (uses UserRowRenderer)
// Config is refreshed once per batch by syncUserRowRendererConfig, not here
function createUserRow(user, imageCount) {
  if (userRowRenderer) {
    return userRowRenderer.createRow(user, imageCount);
  }

  // Fallback if renderer not initialized
  console.warn('[Renderer] UserRowRenderer not initialized');
  const row = document.createElement('tr');
  row.textContent = 'Error: Row renderer not initialized';
  return row;
}

// Row currently carrying the 'selected' class, kept so deselecting does not
// have to walk every row in the table
let selectedRowElement = null;

function updateSelectedUserInfo(user) {
  selectedUser = user;

  if (selectionModeManager) {
    selectionModeManager.setCurrentSelectedUser(user);
  } else {
    // Fallback
    const fullName = `${user.first_name} ${user.last_name1} ${user.last_name2 || ''}`;
    selectedUserInfo.textContent = fullName;
  }

  // Enable link button if image is selected
  updateLinkButtonState();
}

function selectUserRow(row, user) {
  // Remove previous selection
  if (selectedRowElement && selectedRowElement !== row) {
    selectedRowElement.classList.remove('selected');
  }

  // Select new row
  row.classList.add('selected');
  selectedRowElement = row;

  updateSelectedUserInfo(user);
}

function updateUserCount() {
  // Update old status bar (if exists)
  if (userCount) {
    userCount.textContent = `Listo. ${currentUsers.length} usuarios cargados.`;
  }

  // Update new status bar
  const statusUsers = document.getElementById('status-users');
  if (statusUsers) {
    statusUsers.textContent = `${currentUsers.length} usuarios cargados`;
  }

  // Update alert badges
  updateAlertBadges();
}

/**
 * Update alert badges for pending requests
 */
function updateAlertBadges() {
  const cardPrintRequestsCount = cardPrintRequests.size;
  const publicationRequestsCount = publicationRequests.size;

  // Calculate duplicates count. displayUsers already counted image usage over
  // the same set, so reuse it rather than walking every user twice more.
  let duplicatesCountValue = 0;
  if (allUsers && allUsers.length > 0) {
    const imageCount = window._imageCountCache || {};

    duplicatesCountValue = allUsers.reduce(
      (count, user) => count + (user.image_path && imageCount[user.image_path] > 1 ? 1 : 0),
      0
    );
  }

  if (cardPrintCount) {
    cardPrintCount.textContent = cardPrintRequestsCount;
  }
  if (cardPrintAlert) {
    // Show badge if: (count > 0) OR (count is 0 but filter is active)
    const shouldShowCardPrint = cardPrintRequestsCount > 0 || (cardPrintRequestsCount === 0 && showCardPrintRequestsOnly);
    cardPrintAlert.style.display = shouldShowCardPrint ? 'flex' : 'none';
    // Add/remove active class based on filter state
    if (showCardPrintRequestsOnly) {
      cardPrintAlert.classList.add('active');
    } else {
      cardPrintAlert.classList.remove('active');
    }
  }

  if (publicationCount) {
    publicationCount.textContent = publicationRequestsCount;
  }
  if (publicationAlert) {
    // Show badge if: (count > 0) OR (count is 0 but filter is active)
    const shouldShowPublication = publicationRequestsCount > 0 || (publicationRequestsCount === 0 && showPublicationRequestsOnly);
    publicationAlert.style.display = shouldShowPublication ? 'flex' : 'none';
    // Add/remove active class based on filter state
    if (showPublicationRequestsOnly) {
      publicationAlert.classList.add('active');
    } else {
      publicationAlert.classList.remove('active');
    }
  }

  if (duplicatesCount) {
    duplicatesCount.textContent = duplicatesCountValue;
  }
  if (duplicatesAlert) {
    // Show badge if: (count > 0) OR (count is 0 but filter is active)
    const shouldShowDuplicates = duplicatesCountValue > 0 || (duplicatesCountValue === 0 && showDuplicatesOnly);
    duplicatesAlert.style.display = shouldShowDuplicates ? 'flex' : 'none';
    // Add/remove active class based on filter state
    if (showDuplicatesOnly) {
      duplicatesAlert.classList.add('active');
    } else {
      duplicatesAlert.classList.remove('active');
    }
  }
}

/**
 * Update photos column visibility based on display preferences
 */
function updatePhotosColumnVisibility() {
  // Hide column if all three options are disabled
  const shouldShowColumn = showCapturedPhotos || showRepositoryPhotos || showRepositoryIndicators;

  const userTable = document.getElementById('user-table');
  if (userTable) {
    if (shouldShowColumn) {
      userTable.classList.remove('hide-photos-column');
    } else {
      userTable.classList.add('hide-photos-column');
    }
  }
}

/**
 * Update UserRowRenderer configuration with current display preferences
 */
function updateUserRowRendererConfig() {
  if (userRowRenderer) {
    userRowRenderer.updateConfig({
      showCapturedPhotos: showCapturedPhotos,
      showRepositoryPhotos: showRepositoryPhotos,
      showRepositoryIndicators: showRepositoryIndicators,
      showAdditionalActions: showAdditionalActions
    });
  }
}

// Search functions
function toggleClearButton() {
  if (searchInput.value.trim()) {
    clearSearchBtn.style.display = 'flex';
  } else {
    clearSearchBtn.style.display = 'none';
  }
}

async function clearSearch() {
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  cancelPendingSearch();
  syncGroupFilterWithSearch();
  await filterUsers();
}

// Get current filters
function getCurrentFilters() {
  const searchTerm = searchInput.value.trim();
  const selectedGroup = groupFilter.value;

  const filters = {};

  // If there's a search term, search across all users (ignore group)
  if (searchTerm) {
    filters.search = searchTerm;
  } else if (selectedGroup) {
    // Only apply group filter if there's no search term
    filters.group = selectedGroup;
  }

  return filters;
}

// Filter users
async function filterUsers() {
  const filters = getCurrentFilters();
  // Changing search/group filters never alters user data, so the cached full
  // list used for duplicate detection can be reused instead of refetched
  await loadUsers(filters, { reuseAllUsers: true });
}

// Image management
// Load images - delegates to ImageGridManager
async function loadImages() {
  if (imageGridManager) {
    return await imageGridManager.loadImages(true);
  }
  return false;
}

// Clear images - delegates to ImageGridManager
function clearImages() {
  if (imageGridManager) {
    imageGridManager.clear();
  }
}

// Status Bar
async function updateStatusBar() {
  try {
    const result = await window.electronAPI.getProjectInfo();

    const statusBar = document.getElementById('status-bar');
    const statusProject = document.getElementById('status-project');
    const statusRepository = document.getElementById('status-repository');
    const statusPhotos = document.getElementById('status-photos');

    if (result.success && statusBar && statusProject && statusRepository) {
      // Show the status bar
      statusBar.style.display = 'flex';

      // Update project name (show only folder name)
      const projectName = result.projectPath.split('\\').pop() || result.projectPath.split('/').pop();
      statusProject.textContent = projectName;
      statusProject.title = result.projectPath; // Full path in tooltip

      // Update repository path (show full path)
      if (result.repositoryPath) {
        statusRepository.textContent = result.repositoryPath;
        statusRepository.title = result.repositoryPath; // Full path in tooltip
      } else {
        statusRepository.textContent = 'No configurado';
        statusRepository.title = '';
      }

      // Update captured photos count
      if (statusPhotos) {
        await updateCapturedPhotosCount();
      }
    } else if (statusBar) {
      // Hide if no project is open
      statusBar.style.display = 'none';
    }
  } catch (error) {
    console.error('Error updating status bar:', error);
  }
}

/**
 * Update linked photos count in status bar
 */
async function updateCapturedPhotosCount() {
  try {
    const statusPhotos = document.getElementById('status-photos');
    if (!statusPhotos) return;

    // Count unique linked images from all users
    if (allUsers && allUsers.length > 0) {
      const linkedImages = new Set();
      allUsers.forEach(user => {
        if (user.image_path) {
          linkedImages.add(user.image_path);
        }
      });
      statusPhotos.textContent = linkedImages.size.toString();
    } else {
      statusPhotos.textContent = '0';
    }
  } catch (error) {
    console.error('Error updating linked photos count:', error);
    const statusPhotos = document.getElementById('status-photos');
    if (statusPhotos) {
      statusPhotos.textContent = '-';
    }
  }
}

// Update window title
async function updateWindowTitle() {
  try {
    await window.electronAPI.updateWindowTitle();
  } catch (error) {
    console.error('Error updating window title:', error);
  }
}

// Show image preview - delegates to ImageGridManager
async function showImagePreview() {
  if (imageGridManager && imageGridManager.getImageCount() > 0) {
    imageGridManager.showPreview();
  }
}

// Navigate images - delegates to ImageGridManager
async function navigateImages(direction) {
  if (imageGridManager) {
    imageGridManager.navigate(direction);
  }
}

function navigateUsers(direction) {
  // Walk the list that is actually on display, not the handful of rows the
  // virtual scroll happens to have rendered, so navigation reaches every user
  if (!displayedUsers || displayedUsers.length === 0) return;

  const currentIndex = selectedUser
    ? displayedUsers.findIndex(user => user.id === selectedUser.id)
    : -1;

  let targetIndex;
  if (currentIndex === -1) {
    targetIndex = 0;
  } else {
    targetIndex = currentIndex + direction;

    // Wrap around
    if (targetIndex < 0) {
      targetIndex = displayedUsers.length - 1;
    } else if (targetIndex >= displayedUsers.length) {
      targetIndex = 0;
    }
  }

  const user = displayedUsers[targetIndex];
  if (!user) return;

  // In the grid ↑ and ↓ still go to the previous and next user, so moving
  // through people and linking works the same in both views
  if (isThumbnailGridActive() && thumbnailGridManager) {
    const card = thumbnailGridManager.getCard(user.id);
    if (card) {
      selectUserRow(card, user);
      card.scrollIntoView({ block: 'nearest' });
    }
    return;
  }

  let row = userTableBody.querySelector(`tr[data-user-id="${user.id}"]`);

  // Only when the row is not rendered. scrollToIndex puts the target at the top
  // of the viewport, which on every keypress would rebuild the whole visible
  // range and restart every image; moving to the next row must not do that.
  if (!row && virtualScrollManager) {
    virtualScrollManager.scrollToIndex(targetIndex);
    virtualScrollManager.render();
    row = userTableBody.querySelector(`tr[data-user-id="${user.id}"]`);
  }

  if (row) {
    selectUserRow(row, user);
    // Scrolls only if the row is not already fully visible
    row.scrollIntoView({ block: 'nearest' });
  } else {
    // Rendered range did not reach it; keep the selection state in step anyway
    selectedUser = user;
    updateSelectedUserInfo(user);
  }
}

/**
 * Reflect a link or unlink in the table without reloading it
 *
 * Reloading meant two queries over every user and a repaint of the table for
 * each of the hundreds of links made in a photo session, with the spinner and
 * indicators blinking every time. Everything the table is built from is
 * already in memory, so the user is patched there and only the rows that
 * changed are rebuilt. Rows outside the rendered range need nothing: the
 * virtual scroll builds them from the same objects when they come into view.
 *
 * Besides the user's own row, the rows that can change are those of users
 * sharing the new photo, which become duplicates, and those sharing the photo
 * it replaced, which may stop being duplicates.
 *
 * @param {number} userId
 * @param {string|null} imagePath - Absolute path of the photo, or null to unlink
 */
async function applyCapturedImageChange(userId, imagePath, linkedAt = null) {
  // The duplicates view is defined by the very thing that changed, so its
  // membership has to be computed again. Without the full user list there is
  // nothing to patch either.
  if (showDuplicatesOnly || !userRowRenderer || allUsers.length === 0) {
    await loadUsers(getCurrentFilters());
    return;
  }

  const userInAll = allUsers.find(u => u.id === userId);
  const previousPath = userInAll ? userInAll.image_path : null;

  const userInCurrent = currentUsers.find(u => u.id === userId);
  const selected = selectedUser && selectedUser.id === userId ? selectedUser : null;
  [userInAll, userInCurrent, selected].forEach(user => {
    if (!user) return;
    user.image_path = imagePath;
    // An unlink keeps the date of the last link
    if (linkedAt) user.image_linked_at = linkedAt;
  });

  // Sorted by link date, the user just linked moves to the top: the order
  // changes, not just a row
  if (sortByLinkDate && linkedAt) {
    await displayUsers(currentUsers, allUsers);
    observeLazyImages();
    updateAlertBadges();
    return;
  }

  window._imageCountCache = countImageUsage(allUsers);
  updateCaptureHistoryLinks(allUsers);

  const affectedPaths = new Set([previousPath, imagePath].filter(Boolean));
  const affectedIds = new Set([userId]);
  allUsers.forEach(user => {
    if (user.image_path && affectedPaths.has(user.image_path)) {
      affectedIds.add(user.id);
    }
  });

  // Rows are built from displayedUsers, which may be a filtered view of
  // either list, so that is where the row data has to come from
  syncUserRowRendererConfig();
  const displayedById = new Map(displayedUsers.map(user => [user.id, user]));
  const gridActive = isThumbnailGridActive() && thumbnailGridManager;
  affectedIds.forEach(id => {
    const user = displayedById.get(id);
    if (user) {
      userRowRenderer.replaceRow(userTableBody, user, window._imageCountCache);
      if (gridActive) {
        thumbnailGridManager.replaceCard(user);
      }
    }
  });

  restoreSelectedRowHighlight();
  observeLazyImages();
  updateAlertBadges();
}

// Link image to user
async function handleLinkImage() {
  if (!selectedUser) {
    showInfoModal('Aviso', 'Debes seleccionar un usuario');
    return;
  }

  if (!imageGridManager || !imageGridManager.isPreviewActive()) {
    showInfoModal('Aviso', 'Debes seleccionar una imagen');
    return;
  }

  const imagePath = imageGridManager.getCurrentImagePath();

  const result = await window.electronAPI.linkImageToUser({
    userId: selectedUser.id,
    imagePath
  });

  if (result.success) {
    await applyCapturedImageChange(selectedUser.id, imagePath, result.linkedAt);
  } else if (result.imageAlreadyAssigned) {
    // Image is already assigned to other user(s)
    const userList = result.assignedUsers.map(u => `${u.name} (${u.nia || 'Sin NIA'})`).join(', ');
    const userName = `${selectedUser.first_name} ${selectedUser.last_name1}`;
    // One question for both facts: confirming also replaces the photo this
    // user already has, which used to happen without being mentioned
    const message = result.currentImage
      ? `Esta imagen ya está asignada a: ${userList}. Además, ${userName} ya tiene otra imagen enlazada, que se reemplazará por esta. ¿Deseas continuar?`
      : `Esta imagen ya está asignada a: ${userList}. ¿Deseas continuar y asignarla también a ${userName}?`;

    const confirmed = await showConfirmationModal(message);
    if (confirmed) {
      const confirmResult = await window.electronAPI.confirmLinkImage({
        userId: selectedUser.id,
        imagePath
      });

      if (confirmResult.success) {
        await applyCapturedImageChange(selectedUser.id, imagePath, confirmResult.linkedAt);
      } else {
        showInfoModal('Error', 'Error al enlazar la imagen: ' + confirmResult.error);
      }
    }
  } else if (result.needsConfirmation) {
    const confirmed = await showConfirmationModal(
      'El usuario ya tiene una imagen asignada. ¿Deseas reemplazarla?'
    );

    if (confirmed) {
      const confirmResult = await window.electronAPI.confirmLinkImage({
        userId: selectedUser.id,
        imagePath
      });

      if (confirmResult.success) {
        await applyCapturedImageChange(selectedUser.id, imagePath, confirmResult.linkedAt);
      } else {
        showInfoModal('Error', 'Error al enlazar la imagen: ' + confirmResult.error);
      }
    }
  } else {
    showInfoModal('Error', 'Error al enlazar la imagen: ' + result.error);
  }
}

// Handle orla payment
async function handlePayOrla() {
  if (!selectedUser) {
    showInfoModal('Aviso', 'Debes seleccionar un usuario');
    return;
  }

  try {
    // Get current payment status
    const statusResult = await window.electronAPI.getOrlaPaidStatus(selectedUser.id);

    if (!statusResult.success) {
      showInfoModal('Error', statusResult.error || 'Error al obtener el estado de pago');
      return;
    }

    const currentStatus = statusResult.isPaid;
    const newStatus = !currentStatus;
    const action = newStatus ? 'marcar como pagado' : 'desmarcar como pagado';

    // Confirm action
    const confirmed = await showConfirmationModal(
      `¿Deseas ${action} la orla de ${selectedUser.first_name} ${selectedUser.last_name1}?`
    );

    if (!confirmed) {
      return;
    }

    // Mark as paid/unpaid
    const result = await window.electronAPI.markOrlaPaid(selectedUser.id, newStatus);

    if (result.success) {
      // Update the user's paid status in the current data
      selectedUser.orla_paid = newStatus ? 1 : 0;

      // Update the paid status in currentUsers array
      const userIndex = currentUsers.findIndex(u => u.id === selectedUser.id);
      if (userIndex !== -1) {
        currentUsers[userIndex].orla_paid = newStatus ? 1 : 0;
      }

      // Update the paid status in allUsers array
      const allUserIndex = allUsers.findIndex(u => u.id === selectedUser.id);
      if (allUserIndex !== -1) {
        allUsers[allUserIndex].orla_paid = newStatus ? 1 : 0;
      }

      // Re-display the current user list to show the new icon
      displayUsers(currentUsers, allUsers);

      // Success - no need to show confirmation modal
    } else {
      showInfoModal('Error', result.error || 'Error al actualizar el estado de pago');
    }
  } catch (error) {
    console.error('[handlePayOrla] Error:', error);
    showInfoModal('Error', error.message || 'Error al procesar el pago de orla');
  }
}

// Handle receipt printing
async function handlePrintReceipt() {
  if (!selectedUser) {
    showInfoModal('Aviso', 'Debes seleccionar un usuario');
    return;
  }

  try {
    // Get current printed status
    const statusResult = await window.electronAPI.getReceiptPrintedStatus(selectedUser.id);

    if (!statusResult.success) {
      showInfoModal('Error', statusResult.error || 'Error al obtener el estado de impresión');
      return;
    }

    const currentStatus = statusResult.isPrinted;

    // If already printed, show warning and exit
    if (currentStatus) {
      showInfoModal('⚠️ Aviso', 'El recibo ya está marcado como impreso. No se puede volver a imprimir.');
      return;
    }

    // Check if orla is paid first
    const paidStatusResult = await window.electronAPI.getOrlaPaidStatus(selectedUser.id);

    if (!paidStatusResult.success) {
      showInfoModal('Error', paidStatusResult.error || 'Error al verificar el estado de pago');
      return;
    }

    if (!paidStatusResult.isPaid) {
      showInfoModal('Aviso', 'No se puede imprimir el recibo sin que la orla esté pagada previamente');
      return;
    }

    // Find group name from group code
    let groupName = 'Sin grupo';
    if (selectedUser.group_code && currentGroups.length > 0) {
      const group = currentGroups.find(g => g.code === selectedUser.group_code);
      if (group) {
        groupName = group.name;
      }
    }

    // Prepare receipt data
    const receiptData = {
      userName: `${selectedUser.first_name} ${selectedUser.last_name1} ${selectedUser.last_name2 || ''}`.trim(),
      groupName: groupName
    };

    // Print the receipt
    const printResult = await window.electronAPI.printOrlaReceipt(receiptData);

    if (!printResult.success) {
      showInfoModal('Error', 'Error al imprimir el recibo: ' + (printResult.error || 'Error desconocido'));
      return;
    }

    // Mark as printed after successful print
    const result = await window.electronAPI.markReceiptPrinted(selectedUser.id, true);

    if (result.success) {
      // Update the user's printed status in the current data
      selectedUser.receipt_printed = 1;

      // Update the printed status in currentUsers array
      const userIndex = currentUsers.findIndex(u => u.id === selectedUser.id);
      if (userIndex !== -1) {
        currentUsers[userIndex].receipt_printed = 1;
      }

      // Update the printed status in allUsers array
      const allUserIndex = allUsers.findIndex(u => u.id === selectedUser.id);
      if (allUserIndex !== -1) {
        allUsers[allUserIndex].receipt_printed = 1;
      }

      // Re-display the current user list to show the new icon
      displayUsers(currentUsers, allUsers);

      // Success - no need to show confirmation modal
    } else {
      showInfoModal('Error', result.error || 'Error al actualizar el estado de impresión');
    }
  } catch (error) {
    console.error('[handlePrintReceipt] Error:', error);
    showInfoModal('Error', error.message || 'Error al procesar la impresión del recibo');
  }
}

// Handle unpaying orla from context menu
async function handleUnpayOrla(userId) {
  try {
    // Find the user
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
      showInfoModal('Error', 'Usuario no encontrado');
      return;
    }

    // Confirm action
    const confirmed = await showConfirmationModal(
      `¿Deseas desmarcar como pagada la orla de ${user.first_name} ${user.last_name1}?`
    );

    if (!confirmed) {
      return;
    }

    // Mark as unpaid
    const result = await window.electronAPI.markOrlaPaid(userId, false);

    if (result.success) {
      // Update the user's paid status in all arrays
      user.orla_paid = 0;

      const userIndex = currentUsers.findIndex(u => u.id === userId);
      if (userIndex !== -1) {
        currentUsers[userIndex].orla_paid = 0;
      }

      const allUserIndex = allUsers.findIndex(u => u.id === userId);
      if (allUserIndex !== -1) {
        allUsers[allUserIndex].orla_paid = 0;
      }

      // Update selectedUser if it's the current user
      if (selectedUser && selectedUser.id === userId) {
        selectedUser.orla_paid = 0;
      }

      // Re-display the current user list to update the icon
      displayUsers(currentUsers, allUsers);

      showInfoModal('Éxito', 'Orla desmarcada como pagada correctamente');
    } else {
      showInfoModal('Error', result.error || 'Error al actualizar el estado de pago');
    }
  } catch (error) {
    console.error('[handleUnpayOrla] Error:', error);
    showInfoModal('Error', error.message || 'Error al desmarcar el pago de orla');
  }
}

// Handle unprinting receipt from context menu
async function handleUnprintReceipt(userId) {
  try {
    // Find the user
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
      showInfoModal('Error', 'Usuario no encontrado');
      return;
    }

    // Confirm action
    const confirmed = await showConfirmationModal(
      `¿Deseas desmarcar como impreso el recibo de ${user.first_name} ${user.last_name1}?`
    );

    if (!confirmed) {
      return;
    }

    // Mark as unprinted
    const result = await window.electronAPI.markReceiptPrinted(userId, false);

    if (result.success) {
      // Update the user's printed status in all arrays
      user.receipt_printed = 0;

      const userIndex = currentUsers.findIndex(u => u.id === userId);
      if (userIndex !== -1) {
        currentUsers[userIndex].receipt_printed = 0;
      }

      const allUserIndex = allUsers.findIndex(u => u.id === userId);
      if (allUserIndex !== -1) {
        allUsers[allUserIndex].receipt_printed = 0;
      }

      // Update selectedUser if it's the current user
      if (selectedUser && selectedUser.id === userId) {
        selectedUser.receipt_printed = 0;
      }

      // Re-display the current user list to update the icon
      displayUsers(currentUsers, allUsers);

      showInfoModal('Éxito', 'Recibo desmarcado como impreso correctamente');
    } else {
      showInfoModal('Error', result.error || 'Error al actualizar el estado de impresión');
    }
  } catch (error) {
    console.error('[handleUnprintReceipt] Error:', error);
    showInfoModal('Error', error.message || 'Error al desmarcar la impresión del recibo');
  }
}

function updateLinkButtonState() {
  const hasImageSelected = imageGridManager && imageGridManager.isPreviewActive();
  const hasUserSelected = selectedUser !== null;

  linkBtn.disabled = !(hasImageSelected && hasUserSelected);
}

// Delete photo link
async function handleDeletePhoto() {
  if (!selectedUser) {
    showInfoModal('Aviso', 'Debes seleccionar un usuario');
    return;
  }

  if (!selectedUser.image_path) {
    showInfoModal('Aviso', 'El usuario seleccionado no tiene una fotografía vinculada');
    return;
  }

  const userName = `${selectedUser.first_name} ${selectedUser.last_name1} ${selectedUser.last_name2 || ''}`.trim();

  const confirmed = await showConfirmationModal(
    `¿Estás seguro de que deseas eliminar la fotografía vinculada a ${userName}?`
  );

  if (confirmed) {
    const result = await window.electronAPI.unlinkImageFromUser(selectedUser.id);

    if (result.success) {
      // Patches selectedUser in place, so no reference to refresh
      await applyCapturedImageChange(selectedUser.id, null);
    } else {
      showInfoModal('Error', 'Error al eliminar la fotografía: ' + result.error);
    }
  }
}

// Confirmation modal - using promise-based ConfirmModal class
async function showConfirmationModal(message) {
  const confirmed = await confirmModalInstance.show(message);
  return confirmed;
}

// Info/Alert modal - using promise-based InfoModal class
async function showInfoModal(title, message) {
  // Give the keyboard back to wherever it was. Sending it to the search box
  // every time blocked the arrow keys until the list was clicked.
  const previousFocus = document.activeElement;
  await infoModalInstance.show(title, message);
  if (previousFocus && previousFocus !== document.body && document.contains(previousFocus)
      && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
  }
}

// Show the project information modal (Proyecto > Información del proyecto)
async function handleShowProjectInfo() {
  if (!projectOpen) {
    await showInfoModal('Aviso', 'No hay ningún proyecto abierto');
    return;
  }

  await projectInfoModalInstance.show();
}

// Progress modal functions (delegated to ProgressManager)
function showProgressModal(title = 'Procesando...', message = 'Por favor, espera...') {
  if (progressManager) {
    progressManager.show(title, message);
  }
}

function updateProgress(percentage, message = '', details = '') {
  if (progressManager) {
    progressManager.update(percentage, message, details);
  }
}

function closeProgressModal() {
  if (progressManager) {
    progressManager.close();
  }
}

// Menu listeners now handled by MenuEventManager

// Import images with ID
async function handleImportImagesId() {
  if (!projectOpen) {
    showInfoModal('Aviso', 'Debes abrir o crear un proyecto primero');
    return;
  }

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Seleccionar carpeta con imágenes (nombradas con ID)'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];

    showProgressModal('Importando Imágenes', 'Procesando archivos...');

    const importResult = await window.electronAPI.importImagesWithId(folderPath);

    // Wait a moment to show 100% progress
    await new Promise(resolve => setTimeout(resolve, 500));
    closeProgressModal();

    if (importResult.success) {
      const results = importResult.results;
      let message = `Importación completada:\n\n`;
      message += `Total de imágenes: ${results.total}\n`;
      message += `Enlazadas correctamente: ${results.linked}\n`;

      if (results.notFound.length > 0) {
        message += `\nUsuarios no encontrados (${results.notFound.length}):\n`;
        message += results.notFound.slice(0, 10).join(', ');
        if (results.notFound.length > 10) {
          message += `\n... y ${results.notFound.length - 10} más`;
        }
      }

      if (results.errors.length > 0) {
        message += `\n\nErrores (${results.errors.length}):\n`;
        message += results.errors.slice(0, 5).map(e => `${e.file}: ${e.error}`).join('\n');
        if (results.errors.length > 5) {
          message += `\n... y ${results.errors.length - 5} más`;
        }
      }

      showInfoModal('Importación completada', message);

      // Reload users and images to reflect changes
      await loadUsers(getCurrentFilters());
      await loadImages();
    } else {
      showInfoModal('Error', 'Error al importar imágenes: ' + importResult.error);
    }
  }
}

// Helper function to get users to export based on selection or current view
// Export handlers (delegated to ExportManager)
async function handleExportCSV() {
  if (exportManager) {
    await exportManager.exportCSV();
  }
}

async function handleExportInventoryCSV() {
  if (exportManager) {
    await exportManager.exportInventoryCSV();
  }
}

async function handleExportImages() {
  if (exportManager) {
    await exportManager.exportImagesByID();
  }
}

async function handleExportRepositoryImages() {
  if (exportManager) {
    await exportManager.exportRepositoryImagesByID();
  }
}

async function handleExportImagesName() {
  if (exportManager) {
    await exportManager.exportImagesByName();
  }
}

async function handleExportToRepository() {
  if (exportManager) {
    await exportManager.exportToRepository();
  }
}

async function handleExportMissingRepositoryPhotosPDF() {
  if (exportManager) {
    await exportManager.exportMissingPhotosPDF('repository');
  }
}

async function handleExportMissingCapturedPhotosPDF() {
  if (exportManager) {
    await exportManager.exportMissingPhotosPDF('captured');
  }
}

async function handleExportGroupCoveragePDF() {
  if (exportManager) {
    await exportManager.exportGroupCoveragePDF();
  }
}

// Restore image links from backup
/**
 * Proyecto > Purgar fotos reemplazadas
 *
 * The repository keeps every photo an export replaced, and nothing ever cleans
 * that up on its own: the repository is shared by the whole centre, so the
 * deletion is always asked for, with what it removes on screen first.
 */
async function handlePurgeReplacedArchive() {
  if (!projectOpen) {
    await showInfoModal('Aviso', 'Debes abrir un proyecto primero');
    return;
  }

  const cut = await replacedArchiveModalInstance.show();

  if (!cut) {
    return;
  }

  const confirmed = await showConfirmationModal(
    `¿Seguro que quieres borrar ${cut.photos} ${cut.photos === 1 ? 'foto' : 'fotos'} `
    + `reemplazadas (${cut.label.toLowerCase()})?

`
    + 'El depósito es compartido: desaparecerán para todos los equipos.'
  );

  if (!confirmed) {
    return;
  }

  showProgressModal('Purgando fotos reemplazadas', 'Borrando del depósito...');

  try {
    const result = await window.electronAPI.purgeReplacedArchive(cut.before);

    closeProgressModal();

    if (!result.success) {
      await showInfoModal('Error', 'No se pudieron borrar las fotos: ' + result.error);
      return;
    }

    let message = `Se han borrado ${result.photos} ${result.photos === 1 ? 'foto' : 'fotos'} `
      + `de ${result.runs} ${result.runs === 1 ? 'exportación' : 'exportaciones'}.`;

    if (result.failed && result.failed.length > 0) {
      message += `

No se pudieron borrar ${result.failed.length} carpetas, `
        + 'quizá porque otro equipo las está usando. Puedes volver a intentarlo más tarde.';
    }

    await showInfoModal('Purga completada', message);
  } catch (error) {
    closeProgressModal();
    await showInfoModal('Error', 'No se pudieron borrar las fotos: ' + error.message);
  }
}

/**
 * Proyecto > Revisar solicitudes pendientes
 *
 * The repository's request folders keep what other projects and past courses
 * left pending. Nothing archives those on its own: another project using the
 * same repository may still need them, so the user picks them one by one.
 */
async function handleReviewPendingRequests() {
  if (!projectOpen) {
    await showInfoModal('Aviso', 'Debes abrir un proyecto primero');
    return;
  }

  const chosen = await pendingRequestsModalInstance.show();

  if (!chosen) {
    return;
  }

  const count = chosen.cards.length + chosen.publications.length;
  const confirmed = await showConfirmationModal(
    `¿Archivar ${count} ${count === 1 ? 'solicitud' : 'solicitudes'}?

`
    + 'Se moverán a la subcarpeta Archivadas y dejarán de estar pendientes para todos los equipos. '
    + 'No se borra nada: se pueden devolver a su carpeta a mano.'
  );

  if (!confirmed) {
    return;
  }

  try {
    const result = await window.electronAPI.archivePendingRequests(chosen);

    if (!result.success) {
      await showInfoModal('Error', 'No se pudieron archivar las solicitudes: ' + result.error);
      return;
    }

    const moved = result.cards.moved + result.publications.moved;
    const failed = result.cards.failed.length + result.publications.failed.length;

    let message = `Se han archivado ${moved} ${moved === 1 ? 'solicitud' : 'solicitudes'}.`;
    if (failed > 0) {
      message += `

No se pudieron archivar ${failed}: quizá otro equipo ya las había movido o las está usando.`;
    }

    await showInfoModal('Solicitudes archivadas', message);
  } catch (error) {
    await showInfoModal('Error', 'No se pudieron archivar las solicitudes: ' + error.message);
    return;
  }

  // The badges and row icons
  if (userDataManager) {
    await Promise.all([
      userDataManager.loadCardPrintRequests({ refreshDisplay: false }),
      userDataManager.loadPublicationRequests({ refreshDisplay: false })
    ]);
    userDataManager.updateRepositoryDataInDisplay();
  }
}

async function handleRestoreImageLinks() {
  console.log('[Renderer] handleRestoreImageLinks called');

  if (!projectOpen) {
    await showInfoModal('Aviso', 'Debes abrir un proyecto primero');
    return;
  }

  try {
    console.log('[Renderer] Showing restore backup modal');
    // Show modal and get selected backup date
    const backupDate = await restoreBackupModalInstance.show();

    console.log('[Renderer] Selected backup date:', backupDate);

    if (!backupDate) {
      // User cancelled
      console.log('[Renderer] User cancelled backup selection');
      return;
    }

    // Show confirmation before restoring
    console.log('[Renderer] Showing confirmation dialog');
    const confirmed = await showConfirmationModal(
      `¿Estás seguro de que deseas restaurar los enlaces desde esta copia de seguridad?\n\n` +
      `Fecha: ${new Date(backupDate).toLocaleString('es-ES')}\n\n` +
      `Esto reemplazará todos los enlaces actuales de imágenes capturadas.`
    );

    console.log('[Renderer] User confirmed:', confirmed);

    if (!confirmed) {
      return;
    }

    // Show progress
    showProgressModal('Restaurando enlaces', 'Restaurando enlaces de imágenes...');

    console.log('[Renderer] Calling restoreImageRelationships with date:', backupDate);
    // Restore from backup
    const result = await window.electronAPI.restoreImageRelationships(backupDate);

    console.log('[Renderer] Restore result:', result);

    closeProgressModal();

    if (result.success) {
      await showInfoModal(
        'Restauración completada',
        `Se han restaurado ${result.restored} enlaces de imágenes capturadas.\n\n` +
        `Fecha de backup: ${new Date(backupDate).toLocaleString('es-ES')}`
      );

      // Reload users to reflect changes
      console.log('[Renderer] Reloading users');
      await loadUsers(getCurrentFilters());
    } else {
      await showInfoModal('Error', 'Error al restaurar enlaces: ' + result.error);
    }
  } catch (error) {
    console.error('[Renderer] Error in handleRestoreImageLinks:', error);
    closeProgressModal();
    await showInfoModal('Error', 'Error inesperado: ' + error.message);
  }
}

// Handle preferences. category opens the window on that panel
async function handlePreferences(category) {
  console.log('[Renderer] handlePreferences called');

  try {
    // Get current preferences
    const prefsResult = await window.electronAPI.getPreferences();

    if (!prefsResult.success) {
      await showInfoModal('Error', 'Error al cargar preferencias: ' + prefsResult.error);
      return;
    }

    // Show preferences modal
    const newPreferences = await preferencesModalInstance.show(prefsResult.preferences, { category });

    if (!newPreferences) {
      // User cancelled
      console.log('[Renderer] User cancelled preferences');
      return;
    }

    // Save new preferences
    const saveResult = await window.electronAPI.savePreferences(newPreferences);

    if (saveResult.success) {
      // Nothing to apply here: receipts, PDFs and the export dialog read these
      // settings each time they are used, the display options belong to the Ver menu, and the
      // main process shows or hides the orla service itself
      await showInfoModal('Preferencias guardadas', 'Las preferencias se han guardado correctamente.');
    } else {
      await showInfoModal('Error', 'Error al guardar preferencias: ' + saveResult.error);
    }
  } catch (error) {
    console.error('[Renderer] Error in handlePreferences:', error);
    await showInfoModal('Error', 'Error inesperado: ' + error.message);
  }
}

// Export the photo roster PDF
async function handleExportPhotoRosterPDF() {
  if (photoRosterExportManager) {
    await photoRosterExportManager.exportPhotoRosterPDF();
  }
}

// Handle paid orla PDF export
async function handleExportPaidOrlaPDF() {
  if (orlaExportManager) {
    await orlaExportManager.exportPaidOrlaPDF();
  }
}

// Handle paid users CSV export
async function handleExportPaidUsersCSV() {
  if (!projectOpen) {
    showInfoModal('Aviso', 'Debes abrir o crear un proyecto primero');
    return;
  }

  try {
    // Filter only paid users (orla_paid === 1)
    const paidUsers = allUsers.filter(user => user.orla_paid === 1);

    if (paidUsers.length === 0) {
      showInfoModal('Aviso', 'No hay usuarios con orla pagada en el proyecto');
      return;
    }

    // Ask user to select export folder
    const dialogResult = await window.electronAPI.selectExportFolder({
      title: 'Seleccionar carpeta de exportación',
      buttonLabel: 'Exportar',
      properties: ['openDirectory', 'createDirectory']
    });

    if (!dialogResult || dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) {
      return; // User cancelled
    }

    const exportPath = dialogResult.filePaths[0];

    // Show progress modal
    showProgressModal('Exportando listado CSV...', 'Preparando exportación...');

    // Call IPC handler to generate CSV
    const result = await window.electronAPI.exportPaidUsersCSV({
      exportPath,
      users: paidUsers
    });

    // Close progress modal
    closeProgressModal();

    if (result.success) {
      showInfoModal(
        'Exportación Completada',
        `Se ha generado el archivo ${result.fileName} correctamente con ${paidUsers.length} alumno${paidUsers.length !== 1 ? 's' : ''}.`
      );
    } else {
      showInfoModal('Error', result.error || 'Error desconocido al exportar CSV');
    }
  } catch (error) {
    console.error('[handleExportPaidUsersCSV] Error:', error);
    closeProgressModal();
    showInfoModal('Error', error.message || 'Error al exportar CSV de alumnos pagados');
  }
}

// Detect available cameras
async function detectAvailableCameras() {
  try {
    // Request camera permission to get device labels
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    // Get all video input devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter(device => device.kind === 'videoinput')
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Cámara ${device.deviceId.substring(0, 8)}`
      }));

    // Stop the stream immediately
    stream.getTracks().forEach(track => track.stop());

    // Send available cameras to main process
    await window.electronAPI.updateAvailableCameras(cameras);
  } catch (error) {
    console.log('No se pudieron detectar las cámaras:', error);
    // Even if camera access fails, try to get devices without labels
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        .filter(device => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Cámara ${index + 1}`
        }));
      await window.electronAPI.updateAvailableCameras(cameras);
    } catch (err) {
      console.error('Error al detectar cámaras:', err);
    }
  }
}

async function handleUpdateXML() {
  if (projectManager) {
    await projectManager.handleUpdateXML();
  }
}

// Add image tag
// Image tags handlers (delegated to ImageTagsManager)
async function handleAddImageTag() {
  if (imageTagsManager) {
    await imageTagsManager.handleAddTag();
  }
}

async function loadImageTags() {
  if (imageTagsManager) {
    await imageTagsManager.loadTags();
  }
}

async function handleShowTaggedImages() {
  if (imageTagsManager) {
    await imageTagsManager.showTaggedImages();
  }
}

// Handle card print request for selected users
async function handleRequestCardPrint(userIds) {
  try {
    console.log('[CardPrint] Requesting card print for users:', userIds);

    // Get project info to check if project is open
    const projectInfo = await window.electronAPI.getProjectInfo();
    if (!projectInfo.success || !projectInfo.projectPath) {
      showInfoModal('Aviso', 'Debe abrir un proyecto primero');
      return;
    }

    if (userIds.length === 0) {
      showInfoModal('Aviso', 'No hay usuarios seleccionados');
      return;
    }

    // Show progress modal
    if (progressManager) {
      progressManager.show('Solicitando impresión de carnets', 'Generando archivos...');
    }

    // Request card print via IPC
    const result = await window.electronAPI.requestCardPrint(userIds);

    // Close progress modal
    if (progressManager) {
      progressManager.close();
    }

    if (result.success) {
      // Reload card print requests to update indicators
      if (userDataManager) {
        await userDataManager.loadCardPrintRequests();
      }

      let message = `Se han generado ${result.count} archivo(s) en la carpeta 'To-Print-ID'`;
      if (result.skipped > 0) {
        message += `\n\n${result.skipped} usuario(s) omitido(s) por no tener imagen en el depósito`;
      }

      showInfoModal('Solicitud completada', message);
    } else {
      showInfoModal('Error', `Error al solicitar impresión: ${result.error}`);
    }
  } catch (error) {
    console.error('[CardPrint] Error requesting card print:', error);
    if (progressManager) {
      progressManager.close();
    }
    showInfoModal('Error', `Error al solicitar impresión: ${error.message}`);
  }
}

/**
 * Handle request for official publication
 * @param {number[]} userIds - Array of user IDs to request publication for
 */
async function handleRequestPublication(userIds) {
  try {
    console.log('[Publication] Requesting publication for users:', userIds);

    // Get project info to check if project is open
    const projectInfo = await window.electronAPI.getProjectInfo();
    if (!projectInfo.success || !projectInfo.projectPath) {
      showInfoModal('Aviso', 'Debe abrir un proyecto primero');
      return;
    }

    if (userIds.length === 0) {
      showInfoModal('Aviso', 'No hay usuarios seleccionados');
      return;
    }

    // Show progress modal
    if (progressManager) {
      progressManager.show('Solicitando Petición Oficial', 'Copiando imágenes...');
    }

    // Request publication via IPC
    const result = await window.electronAPI.requestPublication(userIds);

    // Close progress modal
    if (progressManager) {
      progressManager.close();
    }

    if (result.success) {
      // Reload publication requests to update indicators
      if (userDataManager) {
        await userDataManager.loadPublicationRequests();
      }

      let message = `Se han copiado ${result.count} imagen(es) en la carpeta 'To-Publish'`;
      if (result.skipped > 0) {
        message += `\n\n${result.skipped} usuario(s) omitido(s) por no tener imagen en el depósito`;
      }

      showInfoModal('Solicitud completada', message);
    } else {
      showInfoModal('Error', `Error al solicitar publicación: ${result.error}`);
    }
  } catch (error) {
    console.error('[Publication] Error requesting publication:', error);
    if (progressManager) {
      progressManager.close();
    }
    showInfoModal('Error', `Error al solicitar publicación: ${error.message}`);
  }
}

// Show user image modal (delegated to UserImageModal)
function showUserImageModal(user, imageType = 'captured') {
  if (userImageModalInstance) {
    userImageModalInstance.show(user, imageType);
  }
}

// Initialize lazy loading with IntersectionObserver (delegated to LazyImageManager)
function initLazyLoading() {
  if (lazyImageManager) {
    lazyImageManager.init();
  }
}

// Observe all images with lazy-image class (delegated to LazyImageManager)
function observeLazyImages() {
  if (lazyImageManager) {
    lazyImageManager.observeAll();
  }
}

// Selection mode handlers (delegated to SelectionModeManager)
function showContextMenu(event, user, row) {
  if (selectionModeManager) {
    selectionModeManager.showContextMenu(event, user);
  }
}

function enableSelectionMode(initialUserId) {
  if (selectionModeManager) {
    selectionModeManager.enable(initialUserId);
  }
}

function disableSelectionMode() {
  if (selectionModeManager) {
    selectionModeManager.disable();
  }
}

function toggleUserSelection(userId, isChecked) {
  if (selectionModeManager) {
    selectionModeManager.toggleSelection(userId, isChecked);
  }
}

function updateSelectionInfo() {
  if (selectionModeManager) {
    selectionModeManager.updateSelectionInfo();
  }
}

function updateTableHeader() {
  if (selectionModeManager) {
    selectionModeManager.updateTableHeader();
  }
}
