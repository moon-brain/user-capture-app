// @ts-check
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Project management
  createProject: (data) => ipcRenderer.invoke('create-project', data),
  openProject: (folderPath) => ipcRenderer.invoke('open-project', folderPath),
  closeProject: () => ipcRenderer.invoke('close-project'),

  // User management
  getUsers: (filters, options) => ipcRenderer.invoke('get-users', filters, options),
  getGroups: () => ipcRenderer.invoke('get-groups'),
  loadRepositoryImages: (users) => ipcRenderer.invoke('load-repository-images', users),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  getProjectInfo: () => ipcRenderer.invoke('get-project-info'),

  // Image management
  getImages: () => ipcRenderer.invoke('get-images'),
  saveCapturedImage: (imageData) => ipcRenderer.invoke('save-captured-image', imageData),
  linkImageToUser: (data) => ipcRenderer.invoke('link-image-user', data),
  confirmLinkImage: (data) => ipcRenderer.invoke('confirm-link-image', data),

  // Orla payment
  markOrlaPaid: (userId, isPaid) => ipcRenderer.invoke('mark-orla-paid', userId, isPaid),
  getOrlaPaidStatus: (userId) => ipcRenderer.invoke('get-orla-paid-status', userId),

  // Receipt printing
  markReceiptPrinted: (userId, isPrinted) => ipcRenderer.invoke('mark-receipt-printed', userId, isPrinted),
  getReceiptPrintedStatus: (userId) => ipcRenderer.invoke('get-receipt-printed-status', userId),

  // Dialog
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  // Folder picker for exports: opens at the last export folder and remembers the new one
  selectExportFolder: (options) => ipcRenderer.invoke('select-export-folder', options),
  focusWindow: () => ipcRenderer.invoke('focus-window'),

  // Events from main process
  onImageDetecting: (callback) => {
    ipcRenderer.on('image-detecting', (event, filename) => callback(filename));
  },

  onImageRejected: (callback) => {
    ipcRenderer.on('image-rejected', (event, data) => callback(data));
  },
  onCapturedImagesChanged: (callback) => {
    ipcRenderer.on('captured-images-changed', callback);
  },
  onNewImageDetected: (callback) => {
    ipcRenderer.on('new-image-detected', (event, filename) => callback(filename));
  },

  onRepositoryChanged: (callback) => {
    ipcRenderer.on('repository-changed', (event, data) => callback(data));
  },

  onSyncProgress: (callback) => {
    ipcRenderer.on('sync-progress', (event, data) => callback(data));
  },

  onSyncCompleted: (callback) => {
    ipcRenderer.on('sync-completed', (event, result) => callback(result));
  },

  onProgress: (callback) => {
    ipcRenderer.on('progress', (event, data) => callback(data));
  },

  onMenuNewProject: (callback) => {
    ipcRenderer.on('menu-new-project', callback);
  },

  onMenuOpenProject: (callback) => {
    ipcRenderer.on('menu-open-project', callback);
  },

  onMenuCloseProject: (callback) => {
    ipcRenderer.on('menu-close-project', callback);
  },

  onMenuRestoreImageLinks: (callback) => {
    ipcRenderer.on('menu-restore-image-links', callback);
  },

  onMenuPurgeReplacedArchive: (callback) => {
    ipcRenderer.on('menu-purge-replaced-archive', callback);
  },
  onMenuReviewPendingRequests: (callback) => {
    ipcRenderer.on('menu-review-pending-requests', callback);
  },

  onMenuPreferences: (callback) => {
    ipcRenderer.on('menu-preferences', callback);
  },

  onMenuToggleCamera: (callback) => {
    ipcRenderer.on('menu-toggle-camera', (event, enabled) => callback(enabled));
  },


  onProjectOpened: (callback) => {
    ipcRenderer.on('project-opened', (event, data) => callback(data));
  },

  onMenuLinkImage: (callback) => {
    ipcRenderer.on('menu-link-image', callback);
  },

  onMenuDeletePhoto: (callback) => {
    ipcRenderer.on('menu-delete-photo', callback);
  },

  onMenuToggleDuplicates: (callback) => {
    ipcRenderer.on('menu-toggle-duplicates', (event, enabled) => callback(enabled));
  },

  onMenuToggleCardPrintRequests: (callback) => {
    ipcRenderer.on('menu-toggle-card-print-requests', (event, enabled) => callback(enabled));
  },

  onMenuTogglePublicationRequests: (callback) => {
    ipcRenderer.on('menu-toggle-publication-requests', (event, enabled) => callback(enabled));
  },

  onMenuToggleCapturedPhotos: (callback) => {
    ipcRenderer.on('menu-toggle-captured-photos', (event, enabled) => callback(enabled));
  },

  onMenuToggleRepositoryPhotos: (callback) => {
    ipcRenderer.on('menu-toggle-repository-photos', (event, enabled) => callback(enabled));
  },

  onMenuToggleRepositoryIndicators: (callback) => {
    ipcRenderer.on('menu-toggle-repository-indicators', (event, enabled) => callback(enabled));
  },

  onInitialDisplayPreferences: (callback) => {
    ipcRenderer.on('initial-display-preferences', (event, prefs) => callback(prefs));
  },

  onMenuShowAbout: (callback) => {
    ipcRenderer.on('menu-show-about', callback);
  },

  onMenuCheckUpdates: (callback) => {
    ipcRenderer.on('menu-check-updates', callback);
  },

  onMenuImportImagesId: (callback) => {
    ipcRenderer.on('menu-import-images-id', callback);
  },

  onMenuExportCSV: (callback) => {
    ipcRenderer.on('menu-export-csv', callback);
  },

  onMenuExportInventoryCSV: (callback) => {
    ipcRenderer.on('menu-export-inventory-csv', callback);
  },

  onMenuExportImages: (callback) => {
    ipcRenderer.on('menu-export-images', callback);
  },

  onMenuExportRepositoryImages: (callback) => {
    ipcRenderer.on('menu-export-repository-images', callback);
  },
  onMenuExportImagesName: (callback) => {
    ipcRenderer.on('menu-export-images-name', callback);
  },

  onMenuExportToRepository: (callback) => {
    ipcRenderer.on('menu-export-to-repository', callback);
  },

  onMenuExportPhotoRosterPDF: (callback) => {
    ipcRenderer.on('menu-export-photo-roster-pdf', callback);
  },

  onMenuExportPaidOrlaPDF: (callback) => {
    ipcRenderer.on('menu-export-paid-orla-pdf', callback);
  },

  onMenuExportPaidUsersCSV: (callback) => {
    ipcRenderer.on('menu-export-paid-users-csv', callback);
  },

  // Orla menu
  onMenuOrlaPay: (callback) => {
    ipcRenderer.on('menu-orla-pay', callback);
  },

  onMenuOrlaPrintReceipt: (callback) => {
    ipcRenderer.on('menu-orla-print-receipt', callback);
  },

  onMenuOrlaSettings: (callback) => {
    ipcRenderer.on('menu-orla-settings', callback);
  },

  // Preferencias > Orla de graduación turned on or off
  onOrlaServiceChanged: (callback) => {
    ipcRenderer.on('orla-service-changed', (event, enabled) => callback(enabled));
  },

  onMenuExportMissingRepositoryPhotosPDF: (callback) => {
    ipcRenderer.on('menu-export-missing-repository-photos-pdf', callback);
  },

  onMenuExportMissingCapturedPhotosPDF: (callback) => {
    ipcRenderer.on('menu-export-missing-captured-photos-pdf', callback);
  },

  onMenuExportGroupCoveragePDF: (callback) => {
    ipcRenderer.on('menu-export-group-coverage-pdf', callback);
  },

  importImagesWithId: (folderPath) => ipcRenderer.invoke('import-images-with-id', folderPath),
  exportCSV: (folderPath, users) => ipcRenderer.invoke('export-csv', folderPath, users),
  exportInventoryCSV: (folderPath, users) => ipcRenderer.invoke('export-inventory-csv', folderPath, users),
  exportInventoryImages: (folderPath, users, options) => ipcRenderer.invoke('export-inventory-images', folderPath, users, options),
  exportImages: (folderPath, users, options) => ipcRenderer.invoke('export-images', folderPath, users, options),
  exportImagesName: (folderPath, users, options) => ipcRenderer.invoke('export-images-name', folderPath, users, options),
  exportRepositoryImages: (folderPath, users, options) => ipcRenderer.invoke('export-repository-images', folderPath, users, options),
  countRepositoryImages: (users) => ipcRenderer.invoke('count-repository-images', users),
  exportToRepository: (users, options) => ipcRenderer.invoke('export-to-repository', users, options),
  getRepositoryExportRequests: () => ipcRenderer.invoke('get-repository-export-requests'),
  setRepositoryExportRequests: (requests) => ipcRenderer.invoke('set-repository-export-requests', requests),
  measureThumbnailCache: () => ipcRenderer.invoke('measure-thumbnail-cache'),
  clearThumbnailCache: () => ipcRenderer.invoke('clear-thumbnail-cache'),
  scanReplacedArchive: () => ipcRenderer.invoke('scan-replaced-archive'),
  purgeReplacedArchive: (before) => ipcRenderer.invoke('purge-replaced-archive', before),
  exportPhotoRosterPDF: (data) => ipcRenderer.invoke('export-photo-roster-pdf', data),
  exportPaidUsersListPDF: (data) => ipcRenderer.invoke('export-paid-users-list-pdf', data),
  exportPaidUsersCSV: (data) => ipcRenderer.invoke('export-paid-users-csv', data),
  exportMissingPhotosPDF: (data) => ipcRenderer.invoke('export-missing-photos-pdf', data),
  exportGroupCoveragePDF: (data) => ipcRenderer.invoke('export-group-coverage-pdf', data),

  unlinkImageFromUser: (userId) => ipcRenderer.invoke('unlink-image-user', userId),

  moveImageToIngest: (imagePath) => ipcRenderer.invoke('move-image-to-ingest', imagePath),
  // Path of a File dropped on the window. The nonstandard File.path was
  // removed in Electron 32; the only way left is this preload-side helper.
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Camera
  updateAvailableCameras: (cameras) => ipcRenderer.invoke('update-available-cameras', cameras),
  getSelectedCamera: () => ipcRenderer.invoke('get-selected-camera'),
  onChangeCamera: (callback) => {
    ipcRenderer.on('change-camera', (event, cameraId) => callback(cameraId));
  },

  // XML update
  updateXML: (xmlPath) => ipcRenderer.invoke('update-xml', xmlPath),
  checkSharedXml: () => ipcRenderer.invoke('check-shared-xml'),
  confirmUpdateXML: (data) => ipcRenderer.invoke('confirm-update-xml', data),
  onMenuUpdateXML: (callback) => {
    ipcRenderer.on('menu-update-xml', callback);
  },

  // Global configuration
  getImageRepositoryPath: () => ipcRenderer.invoke('get-image-repository-path'),
  setImageRepositoryPath: (repositoryPath) => ipcRenderer.invoke('set-image-repository-path', repositoryPath),
  updateWindowTitle: () => ipcRenderer.invoke('update-window-title'),
  getSelectedGroupFilter: () => ipcRenderer.invoke('get-selected-group-filter'),
  setSelectedGroupFilter: (groupCode) => ipcRenderer.invoke('set-selected-group-filter', groupCode),
  onGroupFilterChanged: (callback) => {
    ipcRenderer.on('group-filter-changed', (event, groupCode) => callback(groupCode));
  },

  // Image tags
  addImageTag: (data) => ipcRenderer.invoke('add-image-tag', data),
  getImageTags: (imagePath) => ipcRenderer.invoke('get-image-tags', imagePath),
  deleteImageTag: (tagId) => ipcRenderer.invoke('delete-image-tag', tagId),
  getAllImagesWithTags: () => ipcRenderer.invoke('get-all-images-with-tags'),
  onMenuAddImageTag: (callback) => {
    ipcRenderer.on('menu-add-image-tag', callback);
  },
  onMenuShowTaggedImages: (callback) => {
    ipcRenderer.on('menu-show-tagged-images', callback);
  },

  onMenuToggleAdditionalActions: (callback) => {
    ipcRenderer.on('menu-toggle-additional-actions', (event, enabled) => callback(enabled));
  },

  onMenuToggleCaptureHistory: (callback) => {
    ipcRenderer.on('menu-toggle-capture-history', (event, enabled) => callback(enabled));
  },

  onMenuToggleSortByLinkDate: (callback) => {
    ipcRenderer.on('menu-toggle-sort-by-link-date', (event, enabled) => callback(enabled));
  },

  onRepositoryPathChanged: (callback) => {
    ipcRenderer.on('repository-path-changed', callback);
  },

  // Card print requests
  requestCardPrint: (userIds) => ipcRenderer.invoke('request-card-print', userIds),
  getCardPrintRequests: () => ipcRenderer.invoke('get-card-print-requests'),
  checkCardPrintRequests: (userIds) => ipcRenderer.invoke('check-card-print-requests', userIds),
  markCardsAsPrinted: (userIds) => ipcRenderer.invoke('mark-cards-as-printed', userIds),
  getPrintedCards: () => ipcRenderer.invoke('get-printed-cards'),
  clearPrintedCards: () => ipcRenderer.invoke('clear-printed-cards'),

  // Ver > Fotografías por grupo
  getGroupPhotoCoverage: (source) => ipcRenderer.invoke('get-group-photo-coverage', source),

  // Publication requests
  requestPublication: (userIds) => ipcRenderer.invoke('request-publication', userIds),
  getPublicationRequests: () => ipcRenderer.invoke('get-publication-requests'),
  reviewPendingRequests: () => ipcRenderer.invoke('review-pending-requests'),
  archivePendingRequests: (selection) => ipcRenderer.invoke('archive-pending-requests', selection),

  // Filter toggle methods (for badge clicks)
  toggleDuplicatesFilter: (enabled) => ipcRenderer.send('menu-toggle-duplicates-from-renderer', enabled),
  toggleCardPrintRequestsFilter: (enabled) => ipcRenderer.send('menu-toggle-card-print-requests-from-renderer', enabled),
  togglePublicationRequestsFilter: (enabled) => ipcRenderer.send('menu-toggle-publication-requests-from-renderer', enabled),

  // Version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Turning captured photos (Proyecto > Girar las fotos entrantes, and the
  // viewer's buttons)
  rotateCapturedImage: (imagePath, degrees) => ipcRenderer.invoke('rotate-captured-image', imagePath, degrees),
  getIncomingRotation: () => ipcRenderer.invoke('get-incoming-rotation'),
  onIncomingRotationChanged: (callback) => {
    ipcRenderer.on('incoming-rotation-changed', (event, degrees) => callback(degrees));
  },
  // A captured photo was turned, cropped or restored: same name, new pixels
  onCapturedImageRewritten: (callback) => {
    ipcRenderer.on('captured-image-rewritten', (event, data) => callback(data));
  },

  // Cropping captured photos (the viewer's context menu)
  getCapturedImageCropSource: (imagePath) => ipcRenderer.invoke('get-captured-image-crop-source', imagePath),
  cropCapturedImage: (imagePath, rect) => ipcRenderer.invoke('crop-captured-image', imagePath, rect),
  restoreCapturedImage: (imagePath) => ipcRenderer.invoke('restore-captured-image', imagePath),

  // Ver > Vista de miniaturas
  onMenuToggleThumbnailGrid: (callback) => {
    ipcRenderer.on('menu-toggle-thumbnail-grid', (event, enabled) => callback(enabled));
  },
  setThumbnailGridSource: (source) => ipcRenderer.invoke('set-thumbnail-grid-source', source),

  // Ver > Espacios de trabajo
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  applyWorkspace: (id) => ipcRenderer.invoke('apply-workspace', id),
  createWorkspace: (name) => ipcRenderer.invoke('create-workspace', name),
  overwriteWorkspace: (id) => ipcRenderer.invoke('overwrite-workspace', id),
  renameWorkspace: (id, name) => ipcRenderer.invoke('rename-workspace', id, name),
  deleteWorkspace: (id) => ipcRenderer.invoke('delete-workspace', id),
  setWorkspaceHidden: (id, hidden) => ipcRenderer.invoke('set-workspace-hidden', id, hidden),
  onMenuWorkspaces: (callback) => {
    ipcRenderer.on('menu-workspaces', (event, mode) => callback(mode));
  },
  onWorkspacesChanged: (callback) => {
    ipcRenderer.on('workspaces-changed', () => callback());
  },

  // Notices and questions of the main process (see src/main/appDialogs.js)
  onAppDialog: (callback) => {
    ipcRenderer.on('app-dialog', (event, request) => callback(request));
  },
  answerAppDialog: (id, response) => ipcRenderer.send('app-dialog-response', { id, response }),

  // Updates (GitHub Releases)
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  skipUpdateVersion: (version) => ipcRenderer.invoke('skip-update-version', version),
  openReleasePage: (version) => ipcRenderer.invoke('open-release-page', version),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, payload) => callback(payload));
  },

  // Printer configuration
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  savePrinterConfig: (config) => ipcRenderer.invoke('save-printer-config', config),
  getPrinterConfig: () => ipcRenderer.invoke('get-printer-config'),
  openPrinterPreferences: (printerName) => ipcRenderer.invoke('open-printer-preferences', printerName),

  // Receipt configuration
  getReceiptConfig: () => ipcRenderer.invoke('get-receipt-config'),
  setReceiptConfig: (config) => ipcRenderer.invoke('set-receipt-config', config),

  // Receipt printing
  printOrlaReceipt: (receiptData) => ipcRenderer.invoke('print-orla-receipt', receiptData),

  // Image relationships backup
  backupImageRelationships: () => ipcRenderer.invoke('backup-image-relationships'),
  clearCapturedImages: (userIds) => ipcRenderer.invoke('clear-captured-images', userIds),
  restoreImageRelationships: (backupDate) => ipcRenderer.invoke('restore-image-relationships', backupDate),
  getImageBackups: () => ipcRenderer.invoke('get-image-backups'),
  deleteImageBackup: (backupDate) => ipcRenderer.invoke('delete-image-backup', backupDate),

  // Preferences
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: (preferences) => ipcRenderer.invoke('save-preferences', preferences),

  // Project information modal
  getProjectDetails: () => ipcRenderer.invoke('get-project-details'),
  onMenuProjectInfo: (callback) => {
    ipcRenderer.on('menu-project-info', callback);
  },

  // User manual
  openHelp: (target) => ipcRenderer.invoke('open-help', target),
  helpGetPages: () => ipcRenderer.invoke('help-get-pages'),
  helpGetPage: (pageId) => ipcRenderer.invoke('help-get-page', pageId),
  helpSearch: (query) => ipcRenderer.invoke('help-search', query),
  helpOpenExternal: (url) => ipcRenderer.invoke('help-open-external', url),
  onHelpNavigate: (callback) => {
    ipcRenderer.on('help-navigate', (event, target) => callback(target));
  },

  // Ver > Visor en ventana aparte. The main window reports what its viewer
  // shows; the mirror window receives it
  setViewerImage: (image) => ipcRenderer.send('viewer-image-changed', image),
  getViewerMirrorImage: () => ipcRenderer.invoke('get-viewer-mirror-image'),
  onViewerMirrorImage: (callback) => {
    ipcRenderer.on('viewer-mirror-image', (event, image) => callback(image));
  },
  setViewerMirrorFullScreen: (mode) => ipcRenderer.send('viewer-mirror-set-fullscreen', mode),

  // Ingest folder
  onIngestFolderChanged: (callback) => {
    ipcRenderer.on('ingest-folder-changed', callback);
  }
});
