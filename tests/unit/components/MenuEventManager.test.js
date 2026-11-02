/**
 * Tests for MenuEventManager
 */

const { MenuEventManager } = require('../../../src/renderer/components/MenuEventManager');

describe('MenuEventManager', () => {
  let manager;
  let mockConfig;
  let mockElectronAPI;

  beforeEach(() => {
    // Mock electron API
    mockElectronAPI = {
      onInitialDisplayPreferences: jest.fn(),
      onMenuNewProject: jest.fn(),
      onMenuOpenProject: jest.fn(),
      onMenuCloseProject: jest.fn(),
      onProjectOpened: jest.fn(),
      onSyncCompleted: jest.fn(),
      onMenuLinkImage: jest.fn(),
      onMenuDeletePhoto: jest.fn(),
      onMenuToggleDuplicates: jest.fn(),
      onMenuToggleCapturedPhotos: jest.fn(),
      onMenuToggleRepositoryPhotos: jest.fn(),
      onMenuToggleRepositoryIndicators: jest.fn(),
      onMenuImportImagesId: jest.fn(),
      onMenuExportCSV: jest.fn(),
      onMenuExportInventoryCSV: jest.fn(),
      onMenuExportLegacyInventory: jest.fn(),
      onMenuExportImages: jest.fn(),
      onMenuExportRepositoryImages: jest.fn(),
      onMenuExportImagesName: jest.fn(),
      onMenuExportToRepository: jest.fn(),
      onMenuExportPhotoRosterPDF: jest.fn(),
      onMenuExportPaidOrlaPDF: jest.fn(),
      onMenuExportPaidUsersCSV: jest.fn(),
      onMenuOrlaPay: jest.fn(),
      onMenuOrlaPrintReceipt: jest.fn(),
      onMenuOrlaSettings: jest.fn(),
      onOrlaServiceChanged: jest.fn(),
      onMenuExportMissingRepositoryPhotosPDF: jest.fn(),
      onMenuExportMissingCapturedPhotosPDF: jest.fn(),
      onMenuExportGroupCoveragePDF: jest.fn(),
      onMenuUpdateXML: jest.fn(),
      onMenuAddImageTag: jest.fn(),
      onMenuShowTaggedImages: jest.fn(),
      onMenuToggleAdditionalActions: jest.fn(),
      onMenuToggleCaptureHistory: jest.fn(),
      onMenuProjectInfo: jest.fn()
    };

    // Mock config
    mockConfig = {
      setShowDuplicatesOnly: jest.fn(),
      setShowCardPrintRequestsOnly: jest.fn(),
      setShowPublicationRequestsOnly: jest.fn(),
      setShowCapturedPhotos: jest.fn(),
      setShowRepositoryPhotos: jest.fn(),
      setShowRepositoryIndicators: jest.fn(),
      setIsLoadingRepositoryPhotos: jest.fn(),
      setIsLoadingRepositoryIndicators: jest.fn(),
      setRepositorySyncCompleted: jest.fn(),
      setProjectOpen: jest.fn(),
      getCurrentUsers: jest.fn(() => []),
      getAllUsers: jest.fn(() => []),
      onNewProject: jest.fn(),
      onOpenProject: jest.fn(),
      onCloseProject: jest.fn(),
      onProjectLoaded: jest.fn(),
      onLinkImage: jest.fn(),
      onDeletePhoto: jest.fn(),
      onImportImagesId: jest.fn(),
      onExportCSV: jest.fn(),
      onExportInventoryCSV: jest.fn(),
      onExportImages: jest.fn(),
      onExportImagesName: jest.fn(),
      onExportRepositoryImages: jest.fn(),
      onExportToRepository: jest.fn(),
      onExportPhotoRosterPDF: jest.fn(),
      onExportPaidOrlaPDF: jest.fn(),
      onExportPaidUsersCSV: jest.fn(),
      onUpdateXML: jest.fn(),
      onAddImageTag: jest.fn(),
      onShowTaggedImages: jest.fn(),
      onDisplayUsers: jest.fn(),
      onLoadUsers: jest.fn(),
      onLoadRepositoryData: jest.fn(),
      getCurrentFilters: jest.fn(() => ({})),
      duplicatesFilter: { checked: false },
      additionalActionsSection: { style: { display: 'none' } },
      electronAPI: mockElectronAPI
    };

    // Create manager instance
    manager = new MenuEventManager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with not initialized state', () => {
      expect(manager.getIsInitialized()).toBe(false);
    });

    test('should store all callbacks', () => {
      expect(manager.onNewProject).toBe(mockConfig.onNewProject);
      expect(manager.onOpenProject).toBe(mockConfig.onOpenProject);
      expect(manager.onProjectLoaded).toBe(mockConfig.onProjectLoaded);
    });

    test('should use default callbacks if not provided', () => {
      const defaultManager = new MenuEventManager({ electronAPI: mockElectronAPI });

      expect(typeof defaultManager.onNewProject).toBe('function');
      expect(typeof defaultManager.setShowDuplicatesOnly).toBe('function');
    });
  });

  describe('init()', () => {
    test('should set up all listeners', () => {
      manager.init();

      expect(mockElectronAPI.onInitialDisplayPreferences).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuNewProject).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuOpenProject).toHaveBeenCalled();
      expect(mockElectronAPI.onProjectOpened).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuLinkImage).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuDeletePhoto).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuToggleDuplicates).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuToggleCapturedPhotos).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuToggleRepositoryPhotos).toHaveBeenCalled();
      expect(mockElectronAPI.onMenuToggleRepositoryIndicators).toHaveBeenCalled();
    });

    test('should set initialized state to true', () => {
      manager.init();

      expect(manager.getIsInitialized()).toBe(true);
    });

    test('should not initialize twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      manager.init();
      manager.init();

      expect(consoleSpy).toHaveBeenCalledWith('[MenuEventManager] Already initialized');
      expect(mockElectronAPI.onMenuNewProject).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  describe('Initial Display Preferences', () => {
    test('should handle initial preferences', () => {
      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      const prefs = {
        showDuplicatesOnly: true,
        showCapturedPhotos: false,
        showRepositoryPhotos: true,
        showRepositoryIndicators: false,
        showAdditionalActions: true
      };

      handler(prefs);

      expect(mockConfig.setShowDuplicatesOnly).toHaveBeenCalledWith(true);
      expect(mockConfig.setShowCapturedPhotos).toHaveBeenCalledWith(false);
      expect(mockConfig.setShowRepositoryPhotos).toHaveBeenCalledWith(true);
      expect(mockConfig.setShowRepositoryIndicators).toHaveBeenCalledWith(false);
    });

    test.each([
      ['card print requests', { showCardPrintRequestsOnly: true }, 'setShowCardPrintRequestsOnly'],
      ['publication requests', { showPublicationRequestsOnly: true }, 'setShowPublicationRequestsOnly']
    ])('should restore the %s filter saved from the last session', (label, saved, setter) => {
      // Only duplicates used to be restored: the other two came back checked
      // in the menu while the list showed everyone
      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showDuplicatesOnly: false, ...saved });

      expect(mockConfig[setter]).toHaveBeenCalledWith(true);
    });

    test('should leave the request filters off when nothing was saved', () => {
      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showDuplicatesOnly: false });

      expect(mockConfig.setShowCardPrintRequestsOnly).toHaveBeenCalledWith(false);
      expect(mockConfig.setShowPublicationRequestsOnly).toHaveBeenCalledWith(false);
    });

    test('should set loading state for repository photos if enabled', () => {
      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showRepositoryPhotos: true });

      expect(mockConfig.setIsLoadingRepositoryPhotos).toHaveBeenCalledWith(true);
      expect(mockConfig.setRepositorySyncCompleted).toHaveBeenCalledWith(false);
    });

    test('should set loading state for repository indicators if enabled', () => {
      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showRepositoryIndicators: true });

      expect(mockConfig.setIsLoadingRepositoryIndicators).toHaveBeenCalledWith(true);
      expect(mockConfig.setRepositorySyncCompleted).toHaveBeenCalledWith(false);
    });

    test('should toggle additional actions section', () => {
      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showAdditionalActions: true });

      expect(mockConfig.additionalActionsSection.style.display).toBe('block');

      handler({ showAdditionalActions: false });
      expect(mockConfig.additionalActionsSection.style.display).toBe('none');
    });

    test('should trigger repository data loading if preferences enabled and users loaded', () => {
      // Setup: users already loaded
      const mockUsers = [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ];
      mockConfig.getCurrentUsers.mockReturnValue(mockUsers);

      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showRepositoryPhotos: true, showRepositoryIndicators: true });

      // Should call onLoadRepositoryData since repository data not loaded
      expect(mockConfig.onLoadRepositoryData).toHaveBeenCalledWith(mockUsers);
    });

    test('should not trigger repository data loading if data already loaded', () => {
      // Setup: users with repository data already loaded
      const mockUsers = [
        { id: 1, name: 'User 1', repository_image_path: '/path/to/image1.jpg' },
        { id: 2, name: 'User 2', repository_image_path: '/path/to/image2.jpg' }
      ];
      mockConfig.getCurrentUsers.mockReturnValue(mockUsers);

      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showRepositoryPhotos: true });

      // Should NOT call onLoadRepositoryData since data already loaded
      expect(mockConfig.onLoadRepositoryData).not.toHaveBeenCalled();
      // Should stop loading state
      expect(mockConfig.setIsLoadingRepositoryPhotos).toHaveBeenCalledWith(false);
      expect(mockConfig.setIsLoadingRepositoryIndicators).toHaveBeenCalledWith(false);
      expect(mockConfig.setRepositorySyncCompleted).toHaveBeenCalledWith(true);
      expect(mockConfig.onDisplayUsers).toHaveBeenCalled();
    });

    test('should not trigger repository data loading if no users loaded', () => {
      // Setup: no users loaded yet
      mockConfig.getCurrentUsers.mockReturnValue([]);

      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showRepositoryPhotos: true });

      // Should NOT call onLoadRepositoryData since no users loaded
      expect(mockConfig.onLoadRepositoryData).not.toHaveBeenCalled();
    });
  });

  describe('Project Listeners', () => {
    test('should handle new project event', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuNewProject.mock.calls[0][0];
      handler();

      expect(mockConfig.onNewProject).toHaveBeenCalled();
    });

    test('should handle open project event', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuOpenProject.mock.calls[0][0];
      handler();

      expect(mockConfig.onOpenProject).toHaveBeenCalled();
    });

    test('should handle project opened event with success', () => {
      manager.init();

      const handler = mockElectronAPI.onProjectOpened.mock.calls[0][0];
      handler({ success: true });

      expect(mockConfig.setProjectOpen).toHaveBeenCalledWith(true);
      expect(mockConfig.onProjectLoaded).toHaveBeenCalled();
    });

    test('should not call onProjectLoaded if project open failed', () => {
      manager.init();

      const handler = mockElectronAPI.onProjectOpened.mock.calls[0][0];
      handler({ success: false });

      expect(mockConfig.onProjectLoaded).not.toHaveBeenCalled();
    });
  });

  describe('Action Listeners', () => {
    test('should handle link image event', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuLinkImage.mock.calls[0][0];
      handler();

      expect(mockConfig.onLinkImage).toHaveBeenCalled();
    });

    test('should handle delete photo event', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuDeletePhoto.mock.calls[0][0];
      handler();

      expect(mockConfig.onDeletePhoto).toHaveBeenCalled();
    });

    test('should handle update XML event', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuUpdateXML.mock.calls[0][0];
      handler();

      expect(mockConfig.onUpdateXML).toHaveBeenCalled();
    });

    test('should handle project info event', () => {
      mockConfig.onShowProjectInfo = jest.fn();
      manager = new MenuEventManager(mockConfig);
      manager.init();

      const handler = mockElectronAPI.onMenuProjectInfo.mock.calls[0][0];
      handler();

      expect(mockConfig.onShowProjectInfo).toHaveBeenCalled();
    });
  });

  describe('Display Toggles', () => {
    test('should handle toggle duplicates', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuToggleDuplicates.mock.calls[0][0];
      handler(true);

      expect(mockConfig.setShowDuplicatesOnly).toHaveBeenCalledWith(true);
      expect(mockConfig.duplicatesFilter.checked).toBe(true);
      expect(mockConfig.onDisplayUsers).toHaveBeenCalled();
    });

    test('should handle toggle captured photos', async () => {
      manager.init();

      const handler = mockElectronAPI.onMenuToggleCapturedPhotos.mock.calls[0][0];
      await handler(true);

      expect(mockConfig.setShowCapturedPhotos).toHaveBeenCalledWith(true);
      expect(mockConfig.onDisplayUsers).toHaveBeenCalled();
    });

    test('should only repaint when captured photos are shown, even if nobody has one', async () => {
      // The paths always come with the users, so a list without any is a
      // list without photos, not one that has to be loaded again
      mockConfig.getCurrentUsers.mockReturnValue([
        { image_path: null },
        { image_path: null }
      ]);

      manager.init();

      const handler = mockElectronAPI.onMenuToggleCapturedPhotos.mock.calls[0][0];
      await handler(true);

      expect(mockConfig.onLoadUsers).not.toHaveBeenCalled();
      expect(mockConfig.onDisplayUsers).toHaveBeenCalled();
    });

    test('should not reload if captured photos enabled but images are loaded', async () => {
      mockConfig.getCurrentUsers.mockReturnValue([
        { image_path: '/path/to/image.jpg' },
        { image_path: null }
      ]);

      manager.init();

      const handler = mockElectronAPI.onMenuToggleCapturedPhotos.mock.calls[0][0];
      await handler(true);

      expect(mockConfig.onLoadUsers).not.toHaveBeenCalled();
      expect(mockConfig.onDisplayUsers).toHaveBeenCalled();
    });

    test('should handle toggle repository photos when enabled', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuToggleRepositoryPhotos.mock.calls[0][0];
      handler(true);

      expect(mockConfig.setShowRepositoryPhotos).toHaveBeenCalledWith(true);
      expect(mockConfig.setIsLoadingRepositoryPhotos).toHaveBeenCalledWith(true);
      expect(mockConfig.setRepositorySyncCompleted).toHaveBeenCalledWith(false);
      expect(mockConfig.onDisplayUsers).toHaveBeenCalled();
    });

    test('should load repository data if not already loaded', () => {
      mockConfig.getCurrentUsers.mockReturnValue([
        { repository_image_path: null },
        { repository_image_path: null }
      ]);

      manager.init();

      const handler = mockElectronAPI.onMenuToggleRepositoryPhotos.mock.calls[0][0];
      handler(true);

      expect(mockConfig.onLoadRepositoryData).toHaveBeenCalled();
    });

    test('should not load repository data if already loaded', () => {
      mockConfig.getCurrentUsers.mockReturnValue([
        { repository_image_path: '/repo/image.jpg' },
        { repository_image_path: null }
      ]);

      manager.init();

      const handler = mockElectronAPI.onMenuToggleRepositoryPhotos.mock.calls[0][0];
      handler(true);

      expect(mockConfig.onLoadRepositoryData).not.toHaveBeenCalled();
      expect(mockConfig.setIsLoadingRepositoryPhotos).toHaveBeenCalledWith(false);
      expect(mockConfig.setRepositorySyncCompleted).toHaveBeenCalledWith(true);
    });

    test('should stop loading when repository photos disabled', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuToggleRepositoryPhotos.mock.calls[0][0];
      handler(false);

      expect(mockConfig.setIsLoadingRepositoryPhotos).toHaveBeenCalledWith(false);
      expect(mockConfig.onDisplayUsers).toHaveBeenCalled();
    });

    test('should handle toggle repository indicators', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuToggleRepositoryIndicators.mock.calls[0][0];
      handler(true);

      expect(mockConfig.setShowRepositoryIndicators).toHaveBeenCalledWith(true);
      expect(mockConfig.setIsLoadingRepositoryIndicators).toHaveBeenCalledWith(true);
      expect(mockConfig.setRepositorySyncCompleted).toHaveBeenCalledWith(false);
    });
  });

  describe('Export Listeners', () => {
    test('should handle import images by ID', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuImportImagesId.mock.calls[0][0];
      handler();

      expect(mockConfig.onImportImagesId).toHaveBeenCalled();
    });

    test('should handle export CSV', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuExportCSV.mock.calls[0][0];
      handler();

      expect(mockConfig.onExportCSV).toHaveBeenCalled();
    });

    test('should handle export images', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuExportImages.mock.calls[0][0];
      handler();

      expect(mockConfig.onExportImages).toHaveBeenCalled();
    });

    test('should handle export of repository images by ID', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuExportRepositoryImages.mock.calls[0][0];
      handler();

      expect(mockConfig.onExportRepositoryImages).toHaveBeenCalled();
    });

    test('should handle export images by name', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuExportImagesName.mock.calls[0][0];
      handler();

      expect(mockConfig.onExportImagesName).toHaveBeenCalled();
    });

    test('should handle export to repository', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuExportToRepository.mock.calls[0][0];
      handler();

      expect(mockConfig.onExportToRepository).toHaveBeenCalled();
    });
  });

  describe('Image Tag Listeners', () => {
    test('should handle add image tag', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuAddImageTag.mock.calls[0][0];
      handler();

      expect(mockConfig.onAddImageTag).toHaveBeenCalled();
    });

    test('should handle show tagged images', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuShowTaggedImages.mock.calls[0][0];
      handler();

      expect(mockConfig.onShowTaggedImages).toHaveBeenCalled();
    });
  });

  describe('Orla menu', () => {
    beforeEach(() => {
      mockConfig.onOrlaPay = jest.fn();
      mockConfig.onOrlaPrintReceipt = jest.fn();
      mockConfig.onOrlaSettings = jest.fn();
      mockConfig.setOrlaEnabled = jest.fn();
      manager = new MenuEventManager(mockConfig);
      manager.init();
    });

    test.each([
      ['onMenuOrlaPay', 'onOrlaPay'],
      ['onMenuOrlaPrintReceipt', 'onOrlaPrintReceipt'],
      ['onMenuOrlaSettings', 'onOrlaSettings']
    ])('%s should call %s', (event, callback) => {
      mockElectronAPI[event].mock.calls[0][0]();

      expect(mockConfig[callback]).toHaveBeenCalled();
    });

    test('should follow the service being turned on and off', () => {
      const handler = mockElectronAPI.onOrlaServiceChanged.mock.calls[0][0];

      handler(false);
      expect(mockConfig.setOrlaEnabled).toHaveBeenLastCalledWith(false);

      handler(true);
      expect(mockConfig.setOrlaEnabled).toHaveBeenLastCalledWith(true);
    });

    test('should take the service from the initial preferences, on when missing', () => {
      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];

      handler({ orlaEnabled: false });
      expect(mockConfig.setOrlaEnabled).toHaveBeenLastCalledWith(false);

      handler({});
      expect(mockConfig.setOrlaEnabled).toHaveBeenLastCalledWith(true);
    });
  });

  describe('UI Toggles', () => {
    test('should toggle additional actions section', () => {
      manager.init();

      const handler = mockElectronAPI.onMenuToggleAdditionalActions.mock.calls[0][0];

      handler(true);
      expect(mockConfig.additionalActionsSection.style.display).toBe('block');

      handler(false);
      expect(mockConfig.additionalActionsSection.style.display).toBe('none');
    });

    test('should handle missing additional actions section', () => {
      const configWithoutSection = {
        ...mockConfig,
        additionalActionsSection: null
      };

      const managerWithoutSection = new MenuEventManager(configWithoutSection);
      managerWithoutSection.init();

      const handler = mockElectronAPI.onMenuToggleAdditionalActions.mock.calls[0][0];

      expect(() => handler(true)).not.toThrow();
    });

    test('should toggle the capture history strip', () => {
      mockConfig.setShowCaptureHistory = jest.fn();
      mockConfig.onToggleCaptureHistory = jest.fn();
      manager = new MenuEventManager(mockConfig);
      manager.init();

      const handler = mockElectronAPI.onMenuToggleCaptureHistory.mock.calls[0][0];

      handler(true);
      expect(mockConfig.setShowCaptureHistory).toHaveBeenCalledWith(true);
      expect(mockConfig.onToggleCaptureHistory).toHaveBeenCalledWith(true);

      handler(false);
      expect(mockConfig.onToggleCaptureHistory).toHaveBeenLastCalledWith(false);
    });

    test('should apply the saved capture history preference on startup', () => {
      mockConfig.setShowCaptureHistory = jest.fn();
      mockConfig.onToggleCaptureHistory = jest.fn();
      manager = new MenuEventManager(mockConfig);
      manager.init();

      const handler = mockElectronAPI.onInitialDisplayPreferences.mock.calls[0][0];
      handler({ showCaptureHistory: true });

      expect(mockConfig.setShowCaptureHistory).toHaveBeenCalledWith(true);
      expect(mockConfig.onToggleCaptureHistory).toHaveBeenCalledWith(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing duplicates filter', () => {
      const configWithoutFilter = {
        ...mockConfig,
        duplicatesFilter: null
      };

      const managerWithoutFilter = new MenuEventManager(configWithoutFilter);
      managerWithoutFilter.init();

      const handler = mockElectronAPI.onMenuToggleDuplicates.mock.calls[0][0];

      expect(() => handler(true)).not.toThrow();
    });

    test('should handle empty user list for repository toggles', () => {
      mockConfig.getCurrentUsers.mockReturnValue([]);

      manager.init();

      const handler = mockElectronAPI.onMenuToggleRepositoryPhotos.mock.calls[0][0];
      handler(true);

      // Should not try to load repository data for empty list
      expect(mockConfig.onLoadRepositoryData).not.toHaveBeenCalled();
    });

    test('should handle multiple initialization attempts', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      manager.init();
      manager.init();
      manager.init();

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(mockElectronAPI.onMenuNewProject).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });
});
