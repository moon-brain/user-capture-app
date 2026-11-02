/**
 * MenuEventManager - Manages menu event listeners
 *
 * Centralized manager for all IPC menu event handlers.
 * Handles display preferences, project management, and menu actions.
 *
 * Features:
 * - Initial display preferences loading
 * - Project lifecycle events (new, open, loaded)
 * - Display toggle events (duplicates, photos, indicators)
 * - Action events (link, delete, import, export)
 * - State synchronization with global variables
 * - Configurable callbacks for all menu actions
 */

(function(global) {
  'use strict';

  class MenuEventManager {
    constructor(config = {}) {
      // State setters
      this.setShowDuplicatesOnly = config.setShowDuplicatesOnly || ((value) => {});
      this.setShowCardPrintRequestsOnly = config.setShowCardPrintRequestsOnly || ((value) => {});
      this.setShowPublicationRequestsOnly = config.setShowPublicationRequestsOnly || ((value) => {});
      this.setShowCapturedPhotos = config.setShowCapturedPhotos || ((value) => {});
      this.setShowRepositoryPhotos = config.setShowRepositoryPhotos || ((value) => {});
      this.setShowRepositoryIndicators = config.setShowRepositoryIndicators || ((value) => {});
      this.setShowAdditionalActions = config.setShowAdditionalActions || ((value) => {});
      this.setOrlaEnabled = config.setOrlaEnabled || ((value) => {});
      this.setShowCaptureHistory = config.setShowCaptureHistory || ((value) => {});
      this.setIsLoadingRepositoryPhotos = config.setIsLoadingRepositoryPhotos || ((value) => {});
      this.setIsLoadingRepositoryIndicators = config.setIsLoadingRepositoryIndicators || ((value) => {});
      this.setRepositorySyncCompleted = config.setRepositorySyncCompleted || ((value) => {});
      this.setProjectOpen = config.setProjectOpen || ((value) => {});

      // State getters
      this.getCurrentUsers = config.getCurrentUsers || (() => []);
      this.getAllUsers = config.getAllUsers || (() => []);

      // Action callbacks
      this.onNewProject = config.onNewProject || (() => {});
      this.onOpenProject = config.onOpenProject || (() => {});
      this.onCloseProject = config.onCloseProject || (() => {});
      this.onProjectLoaded = config.onProjectLoaded || (() => {});
      this.onLinkImage = config.onLinkImage || (() => {});
      this.onDeletePhoto = config.onDeletePhoto || (() => {});
      this.onImportImagesId = config.onImportImagesId || (() => {});
      this.onExportCSV = config.onExportCSV || (() => {});
      this.onExportInventoryCSV = config.onExportInventoryCSV || (() => {});
      this.onExportLegacyInventory = config.onExportLegacyInventory || (() => {});
      this.onExportImages = config.onExportImages || (() => {});
      this.onExportRepositoryImages = config.onExportRepositoryImages || (() => {});
      this.onExportImagesName = config.onExportImagesName || (() => {});
      this.onExportToRepository = config.onExportToRepository || (() => {});
      this.onExportPhotoRosterPDF = config.onExportPhotoRosterPDF || (() => {});
      this.onExportPaidOrlaPDF = config.onExportPaidOrlaPDF || (() => {});
      this.onExportPaidUsersCSV = config.onExportPaidUsersCSV || (() => {});
      this.onOrlaPay = config.onOrlaPay || (() => {});
      this.onOrlaPrintReceipt = config.onOrlaPrintReceipt || (() => {});
      this.onOrlaSettings = config.onOrlaSettings || (() => {});
      this.onExportMissingRepositoryPhotosPDF = config.onExportMissingRepositoryPhotosPDF || (() => {});
      this.onExportMissingCapturedPhotosPDF = config.onExportMissingCapturedPhotosPDF || (() => {});
      this.onExportGroupCoveragePDF = config.onExportGroupCoveragePDF || (() => {});
      this.onUpdateXML = config.onUpdateXML || (() => {});
      this.onShowProjectInfo = config.onShowProjectInfo || (() => {});
      this.onAddImageTag = config.onAddImageTag || (() => {});
      this.onShowTaggedImages = config.onShowTaggedImages || (() => {});

      // Display callbacks
      this.onDisplayUsers = config.onDisplayUsers || (() => {});
      this.onUpdatePhotosColumnVisibility = config.onUpdatePhotosColumnVisibility || (() => {});
      this.onUpdateUserRowRenderer = config.onUpdateUserRowRenderer || (() => {});
      this.onLoadUsers = config.onLoadUsers || (() => {});
      this.onLoadRepositoryData = config.onLoadRepositoryData || (() => {});
      this.onToggleCaptureHistory = config.onToggleCaptureHistory || (() => {});
      this.getCurrentFilters = config.getCurrentFilters || (() => ({}));

      // DOM elements
      this.duplicatesFilter = config.duplicatesFilter;
      this.additionalActionsSection = config.additionalActionsSection;

      // IPC API
      this.electronAPI = config.electronAPI || window.electronAPI;

      this.isInitialized = false;
    }

    /**
     * Initialize all menu event listeners
     */
    init() {
      if (this.isInitialized) {
        console.warn('[MenuEventManager] Already initialized');
        return;
      }

      this.setupInitialPreferences();
      this.setupProjectListeners();
      this.setupActionListeners();
      this.setupDisplayToggles();
      this.setupExportListeners();
      this.setupOrlaListeners();
      this.setupImageTagListeners();
      this.setupUIToggles();

      this.isInitialized = true;
      console.log('[MenuEventManager] Initialized');
    }

    /**
     * Setup initial display preferences listener
     */
    setupInitialPreferences() {
      this.electronAPI.onInitialDisplayPreferences((prefs) => {
        // All three filters, as the Ver menu shows them checked on start
        this.setShowDuplicatesOnly(prefs.showDuplicatesOnly);
        this.setShowCardPrintRequestsOnly(Boolean(prefs.showCardPrintRequestsOnly));
        this.setShowPublicationRequestsOnly(Boolean(prefs.showPublicationRequestsOnly));
        this.setShowCapturedPhotos(prefs.showCapturedPhotos);
        this.setShowRepositoryPhotos(prefs.showRepositoryPhotos);
        this.setShowRepositoryIndicators(prefs.showRepositoryIndicators);
        this.setShowAdditionalActions(prefs.showAdditionalActions);
        this.setOrlaEnabled(prefs.orlaEnabled !== false);

        // Update photos column visibility based on preferences
        this.onUpdatePhotosColumnVisibility();

        // Update UserRowRenderer config with initial preferences
        this.onUpdateUserRowRenderer();

        // Mark as loading if repository options are enabled in saved preferences
        if (prefs.showRepositoryPhotos) {
          this.setIsLoadingRepositoryPhotos(true);
          this.setRepositorySyncCompleted(false);
        }
        if (prefs.showRepositoryIndicators) {
          this.setIsLoadingRepositoryIndicators(true);
          this.setRepositorySyncCompleted(false);
        }

        // Set initial visibility of Additional Actions section
        if (this.additionalActionsSection) {
          this.additionalActionsSection.style.display = prefs.showAdditionalActions ? 'block' : 'none';
        }

        // Set initial visibility of the capture history strip
        this.setShowCaptureHistory(prefs.showCaptureHistory);
        this.onToggleCaptureHistory(prefs.showCaptureHistory);

        // If repository preferences are enabled and users are already loaded,
        // trigger repository data loading (this handles the race condition on startup)
        if ((prefs.showRepositoryPhotos || prefs.showRepositoryIndicators) &&
            this.getCurrentUsers().length > 0) {
          console.log('[MenuEventManager] Repository preferences enabled with users loaded, triggering repository data load');

          // Check if repository data is actually loaded
          const hasRepositoryData = this.getCurrentUsers().some(u => u.repository_image_path);
          if (!hasRepositoryData) {
            this.onLoadRepositoryData(this.getCurrentUsers());
          } else {
            // Data already loaded, stop loading state and mark sync as completed
            this.setIsLoadingRepositoryPhotos(false);
            this.setIsLoadingRepositoryIndicators(false);
            this.setRepositorySyncCompleted(true);
            // Re-display with actual data (no spinners)
            this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
          }
        }
      });
    }

    /**
     * Setup project lifecycle listeners
     */
    setupProjectListeners() {
      this.electronAPI.onMenuNewProject(() => {
        this.onNewProject();
      });

      this.electronAPI.onMenuOpenProject(() => {
        this.onOpenProject();
      });

      this.electronAPI.onMenuCloseProject(() => {
        this.onCloseProject();
      });

      this.electronAPI.onProjectOpened((data) => {
        if (data.success) {
          this.setProjectOpen(true);
          this.onProjectLoaded();
        }
      });

      // Listen for sync completion from repository mirror
      this.electronAPI.onSyncCompleted(async (result) => {
        console.log('[MenuEventManager] Repository mirror sync completed:', result);

        if (result.success) {
          // Load repository data if users are already loaded
          // Check against the actual state getters, not local variables
          if (this.getCurrentUsers().length > 0) {
            console.log('[MenuEventManager] Users loaded, triggering repository data load after sync');
            this.onLoadRepositoryData(this.getCurrentUsers());
          }
        }
      });
    }

    /**
     * Setup action listeners (link, delete)
     */
    setupActionListeners() {
      this.electronAPI.onMenuLinkImage(() => {
        this.onLinkImage();
      });

      this.electronAPI.onMenuDeletePhoto(() => {
        this.onDeletePhoto();
      });

      this.electronAPI.onMenuUpdateXML(() => {
        this.onUpdateXML();
      });

      this.electronAPI.onMenuProjectInfo(() => {
        this.onShowProjectInfo();
      });
    }

    /**
     * Setup display toggle listeners
     */
    setupDisplayToggles() {
      // Toggle duplicates filter
      this.electronAPI.onMenuToggleDuplicates((enabled) => {
        this.setShowDuplicatesOnly(enabled);
        // Exclusive filter: disable others when this is enabled
        if (enabled) {
          this.setShowCardPrintRequestsOnly(false);
          this.setShowPublicationRequestsOnly(false);
        }
        if (this.duplicatesFilter) {
          this.duplicatesFilter.checked = enabled;
        }
        this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
      });

      // Toggle captured photos
      // The photo paths are always loaded, so showing or hiding the
      // thumbnails only needs a repaint
      this.electronAPI.onMenuToggleCapturedPhotos((enabled) => {
        this.setShowCapturedPhotos(enabled);
        this.onUpdatePhotosColumnVisibility();
        this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
      });

      // Toggle repository photos
      this.electronAPI.onMenuToggleRepositoryPhotos((enabled) => {
        this.setShowRepositoryPhotos(enabled);
        this.onUpdatePhotosColumnVisibility();

        if (enabled) {
          // Mark as loading to show spinners and reset sync completed flag
          this.setIsLoadingRepositoryPhotos(true);
          this.setRepositorySyncCompleted(false);
          // Display users immediately with loading spinners
          this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
        }

        // Load repository data if enabling and not already loaded
        if (enabled && this.getCurrentUsers().length > 0) {
          // Check if repository data is actually loaded (not just the property exists)
          const hasRepositoryData = this.getCurrentUsers().some(u => u.repository_image_path);
          if (!hasRepositoryData) {
            this.onLoadRepositoryData(this.getCurrentUsers());
          } else {
            // Data already loaded, stop loading state and mark sync as completed
            this.setIsLoadingRepositoryPhotos(false);
            this.setRepositorySyncCompleted(true);
            // Re-display with actual data (no spinners)
            this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
          }
        } else if (!enabled) {
          // If disabling, stop loading state
          this.setIsLoadingRepositoryPhotos(false);
          this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
        }
      });

      // Toggle repository indicators
      this.electronAPI.onMenuToggleRepositoryIndicators((enabled) => {
        this.setShowRepositoryIndicators(enabled);
        this.onUpdatePhotosColumnVisibility();

        if (enabled) {
          // Mark as loading to show spinners and reset sync completed flag
          this.setIsLoadingRepositoryIndicators(true);
          this.setRepositorySyncCompleted(false);
          // Display users immediately with loading spinners
          this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
        }

        // Load repository data if enabling and not already loaded
        if (enabled && this.getCurrentUsers().length > 0) {
          // Check if repository data is actually loaded (not just the property exists)
          const hasRepositoryData = this.getCurrentUsers().some(u => u.repository_image_path);
          if (!hasRepositoryData) {
            this.onLoadRepositoryData(this.getCurrentUsers());
          } else {
            // Data already loaded, stop loading state and mark sync as completed
            this.setIsLoadingRepositoryIndicators(false);
            this.setRepositorySyncCompleted(true);
            // Re-display with actual data (no spinners)
            this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
          }
        } else if (!enabled) {
          // If disabling, stop loading state
          this.setIsLoadingRepositoryIndicators(false);
          this.onDisplayUsers(this.getCurrentUsers(), this.getAllUsers());
        }
      });
    }

    /**
     * Setup export listeners
     */
    setupExportListeners() {
      this.electronAPI.onMenuImportImagesId(() => {
        this.onImportImagesId();
      });

      this.electronAPI.onMenuExportCSV(() => {
        this.onExportCSV();
      });

      this.electronAPI.onMenuExportInventoryCSV(() => {
        this.onExportInventoryCSV();
      });

      this.electronAPI.onMenuExportLegacyInventory(() => {
        this.onExportLegacyInventory();
      });

      this.electronAPI.onMenuExportImages(() => {
        this.onExportImages();
      });

      this.electronAPI.onMenuExportRepositoryImages(() => {
        this.onExportRepositoryImages();
      });

      this.electronAPI.onMenuExportImagesName(() => {
        this.onExportImagesName();
      });

      this.electronAPI.onMenuExportToRepository(() => {
        this.onExportToRepository();
      });

      this.electronAPI.onMenuExportPhotoRosterPDF(() => {
        this.onExportPhotoRosterPDF();
      });

      this.electronAPI.onMenuExportPaidOrlaPDF(() => {
        this.onExportPaidOrlaPDF();
      });

      this.electronAPI.onMenuExportPaidUsersCSV(() => {
        this.onExportPaidUsersCSV();
      });

      this.electronAPI.onMenuExportMissingRepositoryPhotosPDF(() => {
        this.onExportMissingRepositoryPhotosPDF();
      });

      this.electronAPI.onMenuExportMissingCapturedPhotosPDF(() => {
        this.onExportMissingCapturedPhotosPDF();
      });

      this.electronAPI.onMenuExportGroupCoveragePDF(() => {
        this.onExportGroupCoveragePDF();
      });
    }

    /**
     * Setup the Orla menu listeners and the switch of the service. The panel
     * and the icons follow Ver > Pagos de la orla, which the main process
     * already sends turned off with the service off
     */
    setupOrlaListeners() {
      this.electronAPI.onMenuOrlaPay(() => {
        this.onOrlaPay();
      });

      this.electronAPI.onMenuOrlaPrintReceipt(() => {
        this.onOrlaPrintReceipt();
      });

      this.electronAPI.onMenuOrlaSettings(() => {
        this.onOrlaSettings();
      });

      this.electronAPI.onOrlaServiceChanged((enabled) => {
        this.setOrlaEnabled(enabled);
      });
    }

    /**
     * Setup image tag listeners
     */
    setupImageTagListeners() {
      this.electronAPI.onMenuAddImageTag(() => {
        this.onAddImageTag();
      });

      this.electronAPI.onMenuShowTaggedImages(() => {
        this.onShowTaggedImages();
      });
    }

    /**
     * Setup UI toggle listeners
     */
    setupUIToggles() {
      this.electronAPI.onMenuToggleAdditionalActions((enabled) => {
        // Update DOM visibility
        if (this.additionalActionsSection) {
          this.additionalActionsSection.style.display = enabled ? 'block' : 'none';
        }

        // Update state
        this.setShowAdditionalActions(enabled);

        // Update UserRowRenderer config and re-render table
        this.onUpdateUserRowRenderer();
        this.onLoadUsers(this.getCurrentFilters());
      });

      this.electronAPI.onMenuToggleCaptureHistory((enabled) => {
        this.setShowCaptureHistory(enabled);
        this.onToggleCaptureHistory(enabled);
      });
    }

    /**
     * Check if initialized
     * @returns {boolean} True if initialized
     */
    getIsInitialized() {
      return this.isInitialized;
    }

    /**
     * Trigger duplicates filter from badge click
     * @param {boolean} enabled - Filter state
     */
    triggerDuplicatesFilter(enabled) {
      if (this.electronAPI && this.electronAPI.toggleDuplicatesFilter) {
        this.electronAPI.toggleDuplicatesFilter(enabled);
      }
    }

    /**
     * Trigger card print requests filter from badge click
     * @param {boolean} enabled - Filter state
     */
    triggerCardPrintRequestsFilter(enabled) {
      if (this.electronAPI && this.electronAPI.toggleCardPrintRequestsFilter) {
        this.electronAPI.toggleCardPrintRequestsFilter(enabled);
      }
    }

    /**
     * Trigger publication requests filter from badge click
     * @param {boolean} enabled - Filter state
     */
    triggerPublicationRequestsFilter(enabled) {
      if (this.electronAPI && this.electronAPI.togglePublicationRequestsFilter) {
        this.electronAPI.togglePublicationRequestsFilter(enabled);
      }
    }
  }

  // Export (for tests and browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MenuEventManager };
  } else if (typeof window !== 'undefined') {
    global.MenuEventManager = MenuEventManager;
  }
})(typeof window !== 'undefined' ? window : global);
