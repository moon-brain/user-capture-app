/**
 * Tests for ExportManager
 */

const { ExportManager } = require('../../../src/renderer/components/ExportManager');

describe('ExportManager', () => {
  let manager;
  let mockExportOptionsModal;
  let mockExportScopeModal;
  let mockConfirmModal;
  let mockShowProgressModal;
  let mockCloseProgressModal;
  let mockShowInfoModal;
  let mockShowOpenDialog;
  let mockElectronAPI;
  let mockGetters;

  beforeEach(() => {
    // Mock ExportOptionsModal
    mockExportOptionsModal = {
      show: jest.fn()
    };

    // Mock ExportScopeModal: answers with the list, as a person pressing
    // Continuar without touching the radios would
    mockExportScopeModal = {
      show: jest.fn().mockResolvedValue('displayed')
    };

    // Mock ConfirmModal
    mockConfirmModal = {
      show: jest.fn()
    };

    // Mock modal functions
    mockShowProgressModal = jest.fn();
    mockCloseProgressModal = jest.fn();
    mockShowInfoModal = jest.fn().mockResolvedValue(undefined);
    mockShowOpenDialog = jest.fn();

    // Mock getters
    mockGetters = {
      getProjectOpen: jest.fn(() => true),
      getSelectionMode: jest.fn(() => false),
      getSelectedUsers: jest.fn(() => new Set()),
      // Undefined until the list is first drawn; the tests that care set it
      getDisplayedUsers: jest.fn(() => undefined),
      getCurrentUsers: jest.fn(() => []),
      getShowDuplicatesOnly: jest.fn(() => false),
      getShowCardPrintRequestsOnly: jest.fn(() => false),
      getShowPublicationRequestsOnly: jest.fn(() => false),
      getGroupFilterLabel: jest.fn(() => 'Todos los grupos'),
      getSearchTerm: jest.fn(() => ''),
      getGroupFilter: jest.fn(() => ''),
      getAllUsers: jest.fn(() => [])
    };

    // Mock Electron API
    mockElectronAPI = {
      exportCSV: jest.fn(),
      exportImages: jest.fn(),
      exportImagesName: jest.fn(),
      exportRepositoryImages: jest.fn(),
      countRepositoryImages: jest.fn().mockResolvedValue({ success: true, withPhoto: 0, withoutPhoto: 0 }),
      exportToRepository: jest.fn(),
      checkCardPrintRequests: jest.fn().mockResolvedValue({ success: true, usersWithRequests: [] }),
      markCardsAsPrinted: jest.fn().mockResolvedValue({ success: true, movedCount: 0 }),
      backupImageRelationships: jest.fn().mockResolvedValue({ success: true, backupDate: '2025-01-01T00:00:00.000Z', count: 5 }),
      clearCapturedImages: jest.fn().mockResolvedValue({ success: true, cleared: 5 })
    };

    // Create manager instance
    manager = new ExportManager({
      exportOptionsModal: mockExportOptionsModal,
      exportScopeModal: mockExportScopeModal,
      confirmModal: mockConfirmModal,
      showProgressModal: mockShowProgressModal,
      closeProgressModal: mockCloseProgressModal,
      showInfoModal: mockShowInfoModal,
      showOpenDialog: mockShowOpenDialog,
      ...mockGetters,
      electronAPI: mockElectronAPI
    });
  });

  describe('Initialization', () => {
    test('should store all configuration', () => {
      expect(manager.exportOptionsModal).toBe(mockExportOptionsModal);
      expect(manager.showProgressModal).toBe(mockShowProgressModal);
      expect(manager.closeProgressModal).toBe(mockCloseProgressModal);
      expect(manager.showInfoModal).toBe(mockShowInfoModal);
      expect(manager.showOpenDialog).toBe(mockShowOpenDialog);
      expect(manager.electronAPI).toBe(mockElectronAPI);
    });
  });

  describe('getUsersToExport()', () => {
    test('should return selected users when in selection mode', () => {
      mockGetters.getSelectionMode.mockReturnValue(true);
      mockGetters.getSelectedUsers.mockReturnValue(new Set([1, 2, 3]));
      mockGetters.getDisplayedUsers.mockReturnValue([
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' },
        { id: 3, name: 'User 3' },
        { id: 4, name: 'User 4' }
      ]);

      const result = manager.getUsersToExport();

      expect(result.length).toBe(3);
      expect(result.map(u => u.id)).toEqual([1, 2, 3]);
    });

    test('should take the users on the list, whichever filter left them there', () => {
      // With Ver > Carnets solicitados the list holds those users, from every
      // group: exporting the group instead took people off the screen
      const onScreen = [{ id: 7 }, { id: 9 }];
      mockGetters.getDisplayedUsers.mockReturnValue(onScreen);
      mockGetters.getCurrentUsers.mockReturnValue([{ id: 1 }, { id: 2 }, { id: 7 }, { id: 9 }]);
      mockGetters.getShowCardPrintRequestsOnly.mockReturnValue(true);

      expect(manager.getUsersToExport()).toBe(onScreen);
    });

    test('should export nobody when the list is empty', () => {
      mockGetters.getDisplayedUsers.mockReturnValue([]);
      mockGetters.getCurrentUsers.mockReturnValue([{ id: 1 }, { id: 2 }]);

      expect(manager.getUsersToExport()).toEqual([]);
    });

    test('should fall back to the loaded users before the list is built', () => {
      const users = [{ id: 1 }, { id: 2 }];
      mockGetters.getDisplayedUsers.mockReturnValue(undefined);
      mockGetters.getCurrentUsers.mockReturnValue(users);

      expect(manager.getUsersToExport()).toBe(users);
    });
  });

  describe('buildScopeOptions() and chooseExportScope()', () => {
    const everyone = [
      { id: 1, group_code: '1ESOA' },
      { id: 2, group_code: '1ESOA' },
      { id: 3, group_code: '2ESOB' },
      { id: 4, group_code: '2ESOB' }
    ];

    const ids = (users) => users.map((user) => user.id);

    test('offers a single scope when the list already is the whole project', () => {
      mockGetters.getAllUsers.mockReturnValue(everyone);
      mockGetters.getDisplayedUsers.mockReturnValue(everyone);

      const scopes = manager.buildScopeOptions();

      // "Todos los usuarios del proyecto" would be the same four people
      expect(scopes).toHaveLength(1);
      expect(scopes[0]).toMatchObject({ id: 'displayed', count: 4 });
    });

    test('offers the group and the project when a group filter narrows the list', () => {
      mockGetters.getAllUsers.mockReturnValue(everyone);
      mockGetters.getDisplayedUsers.mockReturnValue(everyone.slice(0, 2));
      mockGetters.getGroupFilter.mockReturnValue('1ESOA');
      mockGetters.getGroupFilterLabel.mockReturnValue('1ESOA - Primero A');

      const scopes = manager.buildScopeOptions();

      expect(scopes.map((scope) => scope.id)).toEqual(['displayed', 'project']);
      // The group holds the same two the list shows, so it is not repeated
      expect(scopes[0].label).toBe('1ESOA - Primero A');
      expect(scopes[1].count).toBe(4);
    });

    test('offers the whole group when a search narrows it further', () => {
      mockGetters.getAllUsers.mockReturnValue(everyone);
      mockGetters.getDisplayedUsers.mockReturnValue([everyone[0]]);
      mockGetters.getGroupFilter.mockReturnValue('1ESOA');
      mockGetters.getGroupFilterLabel.mockReturnValue('1ESOA - Primero A');
      mockGetters.getSearchTerm.mockReturnValue('garcia');

      const scopes = manager.buildScopeOptions();

      expect(scopes.map((scope) => scope.id)).toEqual(['displayed', 'group', 'project']);
      expect(scopes[1]).toMatchObject({ label: 'Todo el grupo 1ESOA - Primero A', count: 2 });
    });

    test('puts the selection first, without losing the wider scopes', () => {
      mockGetters.getAllUsers.mockReturnValue(everyone);
      mockGetters.getDisplayedUsers.mockReturnValue(everyone);
      mockGetters.getSelectionMode.mockReturnValue(true);
      mockGetters.getSelectedUsers.mockReturnValue(new Set([1, 3]));

      const scopes = manager.buildScopeOptions();

      expect(scopes.map((scope) => scope.id)).toEqual(['selection', 'displayed']);
      expect(ids(scopes[0].users)).toEqual([1, 3]);
    });

    test('does not ask when there is only one possible answer', async () => {
      mockGetters.getAllUsers.mockReturnValue(everyone);
      mockGetters.getDisplayedUsers.mockReturnValue(everyone);

      const scope = await manager.chooseExportScope();

      expect(mockExportScopeModal.show).not.toHaveBeenCalled();
      expect(scope.id).toBe('displayed');
    });

    test('asks when the answers differ, and returns the users of the chosen one', async () => {
      mockGetters.getAllUsers.mockReturnValue(everyone);
      mockGetters.getDisplayedUsers.mockReturnValue(everyone.slice(0, 2));
      mockGetters.getGroupFilter.mockReturnValue('1ESOA');
      mockExportScopeModal.show.mockResolvedValue('project');

      const scope = await manager.chooseExportScope();

      expect(mockExportScopeModal.show).toHaveBeenCalledWith(
        [
          { id: 'displayed', label: 'Todos los grupos', count: 2 },
          { id: 'project', label: 'Todos los usuarios del proyecto', count: 4 }
        ],
        'displayed'
      );
      expect(ids(scope.users)).toEqual([1, 2, 3, 4]);
    });

    test('gives up when the question is cancelled', async () => {
      mockGetters.getAllUsers.mockReturnValue(everyone);
      mockGetters.getDisplayedUsers.mockReturnValue(everyone.slice(0, 2));
      mockGetters.getGroupFilter.mockReturnValue('1ESOA');
      mockExportScopeModal.show.mockResolvedValue(null);

      await expect(manager.chooseExportScope()).resolves.toBeNull();
    });

    test('says there is nobody to export instead of asking', async () => {
      mockGetters.getAllUsers.mockReturnValue([]);
      mockGetters.getDisplayedUsers.mockReturnValue([]);

      await expect(manager.chooseExportScope()).resolves.toBeNull();
      expect(mockExportScopeModal.show).not.toHaveBeenCalled();
      expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', expect.stringContaining('No hay usuarios'));
    });
  });

  describe('describeScopeLabel()', () => {
    test('names the filter of the Ver menu that is on', () => {
      mockGetters.getShowCardPrintRequestsOnly.mockReturnValue(true);
      expect(manager.describeScopeLabel()).toBe('Usuarios con carnet solicitado');

      mockGetters.getShowCardPrintRequestsOnly.mockReturnValue(false);
      mockGetters.getShowPublicationRequestsOnly.mockReturnValue(true);
      expect(manager.describeScopeLabel()).toBe('Usuarios con publicación solicitada');

      mockGetters.getShowPublicationRequestsOnly.mockReturnValue(false);
      mockGetters.getShowDuplicatesOnly.mockReturnValue(true);
      expect(manager.describeScopeLabel()).toBe('Usuarios con asignaciones duplicadas');
    });

    test('names the search or the group when no filter is on', () => {
      mockGetters.getSearchTerm.mockReturnValue('garcia');
      expect(manager.describeScopeLabel()).toContain('garcia');

      mockGetters.getSearchTerm.mockReturnValue('');
      mockGetters.getGroupFilterLabel.mockReturnValue('1ESOA - Primero A');
      expect(manager.describeScopeLabel()).toBe('1ESOA - Primero A');
    });

    test('the selection wins over every filter', () => {
      mockGetters.getSelectionMode.mockReturnValue(true);
      mockGetters.getSelectedUsers.mockReturnValue(new Set([1, 2]));
      mockGetters.getShowCardPrintRequestsOnly.mockReturnValue(true);

      expect(manager.describeScopeLabel()).toBe('2 usuarios seleccionados');
    });
  });

  describe('checkProjectOpen()', () => {
    test('should return true when project is open', () => {
      mockGetters.getProjectOpen.mockReturnValue(true);

      expect(manager.checkProjectOpen()).toBe(true);
      expect(mockShowInfoModal).not.toHaveBeenCalled();
    });

    test('should return false and show warning when project is closed', () => {
      mockGetters.getProjectOpen.mockReturnValue(false);

      expect(manager.checkProjectOpen()).toBe(false);
      expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', 'Debes abrir o crear un proyecto primero');
    });
  });

  describe('exportCSV()', () => {
    beforeEach(() => {
      mockGetters.getCurrentUsers.mockReturnValue([
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ]);
    });

    test('should not export when project is closed', async () => {
      mockGetters.getProjectOpen.mockReturnValue(false);

      await manager.exportCSV();

      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    test('should show folder picker dialog', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true });

      await manager.exportCSV();

      expect(mockShowOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta para guardar el CSV'
      });
    });

    test('should export CSV successfully', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockElectronAPI.exportCSV.mockResolvedValue({
        success: true,
        filename: 'carnets.csv',
        exported: 2,
        ignored: 0
      });

      await manager.exportCSV();

      expect(mockElectronAPI.exportCSV).toHaveBeenCalledWith(
        '/export/path',
        expect.any(Array)
      );

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Exportación exitosa',
        expect.stringContaining('CSV exportado correctamente')
      );
    });

    test('should show ignored count in success message', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockElectronAPI.exportCSV.mockResolvedValue({
        success: true,
        filename: 'carnets.csv',
        exported: 5,
        ignored: 3
      });

      await manager.exportCSV();

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Exportación exitosa',
        expect.stringContaining('3 usuarios ignorados')
      );
    });

    test('should handle export error', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockElectronAPI.exportCSV.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      await manager.exportCSV();

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Error',
        'Error al exportar el CSV: Permission denied'
      );
    });

    test('should not export when user cancels folder picker', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true });

      await manager.exportCSV();

      expect(mockElectronAPI.exportCSV).not.toHaveBeenCalled();
    });
  });

  describe('exportImagesByID()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockGetters.getCurrentUsers.mockReturnValue([
        { id: 1, name: 'User 1', image_path: '/img1.jpg' }
      ]);
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test('should not export when project is closed', async () => {
      mockGetters.getProjectOpen.mockReturnValue(false);

      await manager.exportImagesByID();

      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    test('should show export options modal', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockExportOptionsModal.show.mockResolvedValue(null); // User cancelled

      await manager.exportImagesByID();

      expect(mockExportOptionsModal.show).toHaveBeenCalled();
    });

    test('should not export when user cancels options modal', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockExportOptionsModal.show.mockResolvedValue(null);

      await manager.exportImagesByID();

      expect(mockElectronAPI.exportImages).not.toHaveBeenCalled();
    });

    test('should export with copy mode', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'copy',
        resize: null
      });

      mockElectronAPI.exportImages.mockResolvedValue({ success: true });

      const promise = manager.exportImagesByID();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockShowProgressModal).toHaveBeenCalledWith('Exportando Imágenes', 'Procesando archivos...');
      expect(mockElectronAPI.exportImages).toHaveBeenCalledWith(
        '/export/path',
        expect.any(Array),
        {
          copyOriginal: true,
          resizeEnabled: false,
          boxSize: null,
          maxSizeKB: null
        }
      );
      expect(mockCloseProgressModal).toHaveBeenCalled();
    });

    test('should export with resize mode', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'resize',
        resize: { boxSize: 800, maxSize: 500 }
      });

      mockElectronAPI.exportImages.mockResolvedValue({ success: true });

      const promise = manager.exportImagesByID();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElectronAPI.exportImages).toHaveBeenCalledWith(
        '/export/path',
        expect.any(Array),
        {
          copyOriginal: false,
          resizeEnabled: true,
          boxSize: 800,
          maxSizeKB: 500
        }
      );
    });

    test('should handle export error', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'copy',
        resize: null
      });

      mockElectronAPI.exportImages.mockResolvedValue({
        success: false,
        error: 'Disk full'
      });

      const promise = manager.exportImagesByID();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Error',
        'Error al exportar imágenes: Disk full'
      );
    });
  });

  describe('with nobody to export', () => {
    // Every export that takes its users from the list on screen
    const FLOWS = [
      ['exportCSV', 'exportCSV'],
      ['exportImagesByID', 'exportImages'],
      ['exportRepositoryImagesByID', 'exportRepositoryImages'],
      ['exportImagesByName', 'exportImagesName'],
      ['exportToRepository', 'exportToRepository']
    ];

    beforeEach(() => {
      mockGetters.getCurrentUsers.mockReturnValue([]);
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: true, withPhoto: 0, withoutPhoto: 0 });
    });

    test.each(FLOWS)('%s should warn and stop before any dialog', async (method, apiCall) => {
      await manager[method]();

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Aviso',
        'No hay usuarios que exportar con la selección y los filtros actuales.'
      );
      expect(mockShowOpenDialog).not.toHaveBeenCalled();
      expect(mockExportOptionsModal.show).not.toHaveBeenCalled();
      expect(mockElectronAPI[apiCall]).not.toHaveBeenCalled();
    });

    test('should also stop when a selection mode is on but nothing is selected and the list is empty', async () => {
      mockGetters.getSelectionMode.mockReturnValue(true);

      await manager.exportImagesByID();

      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    describe('inventory', () => {
      let inventoryManager;
      let inventoryModal;

      beforeEach(() => {
        inventoryModal = { show: jest.fn() };
        mockElectronAPI.getGroups = jest.fn().mockResolvedValue({ success: true, groups: [{ code: '1ESOA', name: '1º ESO A' }] });
        mockElectronAPI.getUsers = jest.fn().mockResolvedValue({ success: true, users: [] });
        mockElectronAPI.exportInventoryCSV = jest.fn();

        inventoryManager = new ExportManager({
          exportOptionsModal: mockExportOptionsModal,
          inventoryExportOptionsModal: inventoryModal,
          confirmModal: mockConfirmModal,
          showProgressModal: mockShowProgressModal,
          closeProgressModal: mockCloseProgressModal,
          showInfoModal: mockShowInfoModal,
          showOpenDialog: mockShowOpenDialog,
          ...mockGetters,
          getCurrentFilters: jest.fn(() => ({ group: '1ESOA' })),
          electronAPI: mockElectronAPI
        });
      });

      test('should stop when the chosen group has no users', async () => {
        inventoryModal.show.mockResolvedValue({ scope: 'group' });

        await inventoryManager.exportInventoryCSV();

        expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', 'El grupo seleccionado no tiene usuarios que exportar.');
        expect(mockShowOpenDialog).not.toHaveBeenCalled();
        expect(mockElectronAPI.exportInventoryCSV).not.toHaveBeenCalled();
      });

      test('should stop when the project has no users', async () => {
        inventoryModal.show.mockResolvedValue({ scope: 'all' });

        await inventoryManager.exportInventoryCSV();

        expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', 'El proyecto no tiene usuarios que exportar.');
        expect(mockElectronAPI.exportInventoryCSV).not.toHaveBeenCalled();
      });
    });
  });

  describe('exportLegacyInventory()', () => {
    let legacyManager;
    let inventoryModal;
    const LUIS = { id: 2, type: 'student', nia: '10000002', group_code: '2BACA' };
    const OPTIONS = {
      scope: 'group',
      exportImages: true,
      imageOptions: { copyOriginal: false, resizeEnabled: true, boxSize: 600, maxSizeKB: 200 },
      zipEnabled: true,
      zipMaxSizeMB: 40
    };

    beforeEach(() => {
      jest.useFakeTimers();
      inventoryModal = { show: jest.fn().mockResolvedValue(OPTIONS) };
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\Exportar'] });
      mockElectronAPI.getGroups = jest.fn().mockResolvedValue({ success: true, groups: [{ code: '2BACA', name: 'BTX2BA' }] });
      mockElectronAPI.exportLegacyInventoryCSV = jest.fn().mockResolvedValue({
        success: true,
        results: {
          files: [{ fileName: 'Grupos.csv', rows: 1 }, { fileName: 'Matrícula.csv', rows: 1 }, { fileName: 'Personal.csv', rows: 0 }],
          leftOut: 3
        },
        users: [LUIS]
      });
      mockElectronAPI.exportInventoryImages = jest.fn().mockResolvedValue({
        success: true,
        results: { total: 1, exported: 1, skipped: 0, errors: [], zipFiles: [{ name: 'imagenes.zip', count: 1 }] }
      });

      legacyManager = new ExportManager({
        exportOptionsModal: mockExportOptionsModal,
        inventoryExportOptionsModal: inventoryModal,
        confirmModal: mockConfirmModal,
        showProgressModal: mockShowProgressModal,
        closeProgressModal: mockCloseProgressModal,
        showInfoModal: mockShowInfoModal,
        showOpenDialog: mockShowOpenDialog,
        ...mockGetters,
        getCurrentFilters: jest.fn(() => ({ group: '2BACA' })),
        electronAPI: mockElectronAPI
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const run = async () => {
      const done = legacyManager.exportLegacyInventory();
      await jest.runAllTimersAsync();
      await done;
    };

    test('should open the inventory dialog with its title and the ZIP required', async () => {
      await run();

      expect(inventoryModal.show).toHaveBeenCalledWith({
        selectedGroupCode: '2BACA',
        selectedGroupName: 'BTX2BA',
        title: 'Archivos para Inventario Legacy',
        requireZip: true
      });
    });

    test('should ask for the chosen group only', async () => {
      await run();

      expect(mockElectronAPI.exportLegacyInventoryCSV).toHaveBeenCalledWith('C:\\Exportar', { groupCode: '2BACA' });
    });

    test('should send the photos of the users exported, with the options chosen', async () => {
      await run();

      expect(mockElectronAPI.exportInventoryImages).toHaveBeenCalledWith('C:\\Exportar', [LUIS], {
        copyOriginal: false, resizeEnabled: true, boxSize: 600, maxSizeKB: 200, zipEnabled: true, zipMaxSizeMB: 40
      });
    });

    test('should say which files it wrote and how many students on leave it left out', async () => {
      await run();

      const [title, message] = mockShowInfoModal.mock.calls[0];
      expect(title).toBe('Exportación exitosa');
      expect(message).toContain('Matrícula.csv (1 registros)');
      expect(message).toContain('3 alumnos de baja no se han exportado');
      expect(message).toContain('imagenes.zip (1 imágenes)');
    });

    test('should export no photos when they were not asked for', async () => {
      inventoryModal.show.mockResolvedValue({ scope: 'all', exportImages: false });

      await run();

      expect(mockElectronAPI.exportLegacyInventoryCSV).toHaveBeenCalledWith('C:\\Exportar', { groupCode: null });
      expect(mockElectronAPI.exportInventoryImages).not.toHaveBeenCalled();
    });

    test('should show the reason and export no photos when the files fail', async () => {
      mockElectronAPI.exportLegacyInventoryCSV.mockResolvedValue({ success: false, error: 'No se encuentra el XML' });

      await run();

      expect(mockShowInfoModal).toHaveBeenCalledWith('Error', expect.stringContaining('No se encuentra el XML'));
      expect(mockElectronAPI.exportInventoryImages).not.toHaveBeenCalled();
    });

    test('should do nothing when the dialog or the folder is cancelled', async () => {
      inventoryModal.show.mockResolvedValueOnce(null);
      await run();
      mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
      await run();

      expect(mockElectronAPI.exportLegacyInventoryCSV).not.toHaveBeenCalled();
    });
  });

  describe('exportRepositoryImagesByID()', () => {
    const USERS = [
      { id: 1, nia: '1001', type: 'student', image_path: null },
      { id: 2, nia: '1002', type: 'student', image_path: '/img2.jpg' },
      { id: 3, nia: '1003', type: 'student', image_path: null }
    ];

    const RESULTS = {
      total: 2,
      exported: 2,
      groupsFolders: 1,
      withoutGroup: 0,
      withoutRepositoryImage: 1,
      errors: []
    };

    beforeEach(() => {
      jest.useFakeTimers();
      mockGetters.getCurrentUsers.mockReturnValue(USERS);
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: true, withPhoto: 2, withoutPhoto: 1 });
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/export/path'] });
      mockExportOptionsModal.show.mockResolvedValue({ mode: 'copy', resize: null });
      mockElectronAPI.exportRepositoryImages.mockResolvedValue({ success: true, results: RESULTS });
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    const run = async () => {
      const promise = manager.exportRepositoryImagesByID();
      await jest.runAllTimersAsync();
      await promise;
    };

    test('should not export when project is closed', async () => {
      mockGetters.getProjectOpen.mockReturnValue(false);

      await run();

      expect(mockElectronAPI.countRepositoryImages).not.toHaveBeenCalled();
      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    test('should stop before asking anything when there is nobody to export', async () => {
      mockGetters.getCurrentUsers.mockReturnValue([]);

      await run();

      expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', expect.stringContaining('No hay usuarios'));
      expect(mockElectronAPI.countRepositoryImages).not.toHaveBeenCalled();
      expect(mockElectronAPI.exportRepositoryImages).not.toHaveBeenCalled();
    });

    test('should count the repository photos of the users to export', async () => {
      await run();

      expect(mockElectronAPI.countRepositoryImages).toHaveBeenCalledWith(USERS);
    });

    test('should report a repository that cannot be read', async () => {
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: false, error: 'No se ha configurado el depósito' });

      await run();

      expect(mockShowInfoModal).toHaveBeenCalledWith('Error', 'No se ha configurado el depósito');
      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    test('should stop when nobody has a photo in the repository', async () => {
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: true, withPhoto: 0, withoutPhoto: 3 });

      await run();

      expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', 'Ninguno de los 3 usuarios a exportar tiene foto en el depósito.');
      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    test('should show the repository figures before exporting, not the captured ones', async () => {
      await run();

      expect(mockExportOptionsModal.show).toHaveBeenCalledWith([
        { label: 'Se exportará', value: 'Todos los grupos' },
        { label: 'Imágenes del depósito a exportar', value: '2' },
        { label: 'Usuarios sin foto en el depósito', value: '1' }
      ]);
    });

    test('should not export when the folder picker is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await run();

      expect(mockExportOptionsModal.show).not.toHaveBeenCalled();
      expect(mockElectronAPI.exportRepositoryImages).not.toHaveBeenCalled();
    });

    test('should not export when the options are cancelled', async () => {
      mockExportOptionsModal.show.mockResolvedValue(null);

      await run();

      expect(mockElectronAPI.exportRepositoryImages).not.toHaveBeenCalled();
    });

    test('should export the users with the chosen options', async () => {
      await run();

      expect(mockShowProgressModal).toHaveBeenCalledWith('Exportando Imágenes del Depósito', 'Procesando archivos...');
      expect(mockElectronAPI.exportRepositoryImages).toHaveBeenCalledWith('/export/path', USERS, {
        copyOriginal: true,
        resizeEnabled: false,
        boxSize: null,
        maxSizeKB: null
      });
      expect(mockCloseProgressModal).toHaveBeenCalled();
    });

    test('should say what was exported when it finishes', async () => {
      await run();

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Exportación completada',
        'Se han exportado 2 imágenes en 1 carpeta de grupo.\n1 usuario no tiene foto en el depósito.'
      );
    });

    test('should report a failed export', async () => {
      mockElectronAPI.exportRepositoryImages.mockResolvedValue({ success: false, error: 'Disk full' });

      await run();

      expect(mockShowInfoModal).toHaveBeenCalledWith('Error', 'Error al exportar imágenes del depósito: Disk full');
    });
  });

  describe('summarizeImagesExport()', () => {
    test('should mention users with no group', () => {
      const text = manager.summarizeImagesExport({ exported: 1, groupsFolders: 1, withoutGroup: 2, errors: [] });

      expect(text).toContain('2 usuarios sin grupo no se han exportado.');
    });

    test('should list the first errors and say how many more there are', () => {
      const errors = Array.from({ length: 7 }, (_, i) => ({ user: `Usuario ${i}`, error: 'Imagen no encontrada' }));

      const text = manager.summarizeImagesExport({ exported: 0, groupsFolders: 0, errors });

      expect(text).toContain('No se pudieron exportar 7 imágenes:');
      expect(text).toContain('- Usuario 4: Imagen no encontrada');
      expect(text).not.toContain('Usuario 5');
      expect(text).toContain('... y 2 más');
    });

    test('should use the singular for a single image', () => {
      const text = manager.summarizeImagesExport({
        exported: 1,
        groupsFolders: 1,
        errors: [{ user: 'Ana', error: 'Imagen no encontrada' }]
      });

      expect(text).toContain('Se han exportado 1 imagen en 1 carpeta de grupo.');
      expect(text).toContain('No se pudo exportar 1 imagen:');
    });
  });

  describe('summary after exporting captured images', () => {
    const RESULTS = { total: 3, exported: 2, groupsFolders: 1, withoutGroup: 1, errors: [] };

    beforeEach(() => {
      jest.useFakeTimers();
      mockGetters.getCurrentUsers.mockReturnValue([{ id: 1, image_path: '/img1.jpg' }]);
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/export/path'] });
      mockExportOptionsModal.show.mockResolvedValue({ mode: 'copy', resize: null });
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test.each([
      ['exportImagesByID', 'exportImages'],
      ['exportImagesByName', 'exportImagesName']
    ])('%s should say what was exported and who was left out', async (method, apiCall) => {
      mockElectronAPI[apiCall].mockResolvedValue({ success: true, results: RESULTS });

      const promise = manager[method]();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Exportación completada',
        'Se han exportado 2 imágenes en 1 carpeta de grupo.\n1 usuario sin grupo no se ha exportado.'
      );
    });
  });

  describe('exportImagesByName()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockGetters.getCurrentUsers.mockReturnValue([
        { id: 1, name: 'User 1', image_path: '/img1.jpg' }
      ]);
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test('should call exportImagesName API', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/export/path']
      });

      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'copy',
        resize: null
      });

      mockElectronAPI.exportImagesName.mockResolvedValue({ success: true });

      const promise = manager.exportImagesByName();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElectronAPI.exportImagesName).toHaveBeenCalledWith(
        '/export/path',
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('exportToRepository()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockGetters.getCurrentUsers.mockReturnValue([
        { id: 1, name: 'User 1', image_path: '/img1.jpg' }
      ]);
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test('should not export when project is closed', async () => {
      mockGetters.getProjectOpen.mockReturnValue(false);

      await manager.exportToRepository();

      expect(mockExportOptionsModal.show).not.toHaveBeenCalled();
    });

    test('should show export options modal', async () => {
      mockExportOptionsModal.show.mockResolvedValue(null);

      await manager.exportToRepository();

      expect(mockExportOptionsModal.show).toHaveBeenCalled();
    });

    test('should export successfully', async () => {
      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'resize',
        resize: { boxSize: 800, maxSize: 500 }
      });

      // User declines to clear images
      mockConfirmModal.show.mockResolvedValue(false);

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: {
          total: 10,
          exported: 9,
          errors: [{ user: 'User 1', error: 'Failed' }]
        }
      });

      const onExportComplete = jest.fn();
      manager.onExportComplete = onExportComplete;

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockShowProgressModal).toHaveBeenCalledWith('Exportando al Depósito', 'Procesando archivos...');
      expect(mockElectronAPI.exportToRepository).toHaveBeenCalled();
      expect(mockCloseProgressModal).toHaveBeenCalled();
      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Exportación completada',
        expect.stringContaining('Total de usuarios')
      );
      expect(mockConfirmModal.show).toHaveBeenCalled();
      expect(onExportComplete).toHaveBeenCalled();
    });

    test('should show error details in message', async () => {
      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'copy',
        resize: null
      });

      // User declines to clear images
      mockConfirmModal.show.mockResolvedValue(false);

      const errors = Array(10).fill(null).map((_, i) => ({
        user: `User ${i}`,
        error: `Error ${i}`
      }));

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: {
          total: 20,
          exported: 10,
          errors: errors
        }
      });

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      const message = mockShowInfoModal.mock.calls[0][1];
      expect(message).toContain('Errores (10)');
      expect(message).toContain('y 5 más'); // Shows first 5 + "and 5 more"
    });

    test('should handle export error', async () => {
      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'copy',
        resize: null
      });

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: false,
        error: 'Network error'
      });

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Error',
        'Error al exportar imágenes: Network error'
      );
      expect(mockConfirmModal.show).not.toHaveBeenCalled();
    });

    test('should clear images when user confirms', async () => {
      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'copy',
        resize: null
      });

      // User accepts to clear images
      mockConfirmModal.show.mockResolvedValue(true);

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: {
          total: 10,
          exported: 10,
          exportedUserIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          errors: []
        }
      });

      const onExportComplete = jest.fn();
      manager.onExportComplete = onExportComplete;

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfirmModal.show).toHaveBeenCalled();
      expect(mockElectronAPI.backupImageRelationships).toHaveBeenCalled();
      expect(mockElectronAPI.clearCapturedImages).toHaveBeenCalled();
      expect(mockShowInfoModal).toHaveBeenCalledWith(
        'Fotos desvinculadas',
        expect.stringContaining('Se han desvinculado')
      );
      expect(onExportComplete).toHaveBeenCalledTimes(2); // Once after export, once after clearing
    });

    describe('card and publication requests', () => {
      const exportedResult = {
        success: true,
        results: { total: 3, exported: 2, exportedUserIds: [1, 2], errors: [] }
      };

      const run = async () => {
        const promise = manager.exportToRepository();
        await jest.runAllTimersAsync();
        await promise;
      };

      beforeEach(() => {
        mockConfirmModal.show.mockResolvedValue(false);
        mockElectronAPI.exportToRepository.mockResolvedValue(exportedResult);
        mockElectronAPI.getRepositoryExportRequests = jest.fn()
          .mockResolvedValue({ success: true, requests: { cards: true, publications: false } });
        mockElectronAPI.setRepositoryExportRequests = jest.fn().mockResolvedValue({ success: true });
        mockElectronAPI.requestCardPrint = jest.fn().mockResolvedValue({ success: true, count: 2, skipped: 0 });
        mockElectronAPI.requestPublication = jest.fn().mockResolvedValue({ success: true, count: 2, skipped: 0 });
      });

      test('should offer the requests ticked as the project saved them', async () => {
        mockExportOptionsModal.show.mockResolvedValue(null);

        await manager.exportToRepository();

        expect(mockExportOptionsModal.show).toHaveBeenCalledWith(
          expect.anything(), expect.anything(),
          { requests: { cards: true, publications: false } }
        );
      });

      test('should offer them unticked when the setting cannot be read', async () => {
        mockElectronAPI.getRepositoryExportRequests.mockResolvedValue({ success: false, error: 'x' });
        mockExportOptionsModal.show.mockResolvedValue(null);

        await manager.exportToRepository();

        expect(mockExportOptionsModal.show.mock.calls[0][2]).toEqual({
          requests: { cards: false, publications: false }
        });
      });

      test('should request only for the users whose photo was exported', async () => {
        mockExportOptionsModal.show.mockResolvedValue({
          mode: 'copy', resize: null, requests: { cards: true, publications: true }
        });

        await run();

        expect(mockElectronAPI.requestCardPrint).toHaveBeenCalledWith([1, 2]);
        expect(mockElectronAPI.requestPublication).toHaveBeenCalledWith([1, 2]);
        const message = mockShowInfoModal.mock.calls[0][1];
        expect(message).toContain('Se ha solicitado la impresión de 2 carnets.');
        expect(message).toContain('Se ha solicitado la publicación oficial de 2 fotos.');
      });

      test('should file the requests after the photos are in the repository', async () => {
        mockExportOptionsModal.show.mockResolvedValue({
          mode: 'copy', resize: null, requests: { cards: false, publications: true }
        });

        await run();

        expect(mockElectronAPI.exportToRepository.mock.invocationCallOrder[0])
          .toBeLessThan(mockElectronAPI.requestPublication.mock.invocationCallOrder[0]);
        expect(mockElectronAPI.requestCardPrint).not.toHaveBeenCalled();
      });

      test('should request nothing when both are unticked', async () => {
        mockExportOptionsModal.show.mockResolvedValue({
          mode: 'copy', resize: null, requests: { cards: false, publications: false }
        });

        await run();

        expect(mockElectronAPI.requestCardPrint).not.toHaveBeenCalled();
        expect(mockElectronAPI.requestPublication).not.toHaveBeenCalled();
        expect(mockShowInfoModal.mock.calls[0][1]).not.toContain('solicitado');
      });

      test('should request nothing when no photo was exported', async () => {
        mockExportOptionsModal.show.mockResolvedValue({
          mode: 'copy', resize: null, requests: { cards: true, publications: true }
        });
        mockElectronAPI.exportToRepository.mockResolvedValue({
          success: true,
          results: { total: 1, exported: 0, exportedUserIds: [], errors: [{ user: 'A', error: 'Imagen no encontrada' }] }
        });

        await run();

        expect(mockElectronAPI.requestCardPrint).not.toHaveBeenCalled();
        expect(mockElectronAPI.requestPublication).not.toHaveBeenCalled();
      });

      test('should say in the result when a request could not be filed', async () => {
        mockExportOptionsModal.show.mockResolvedValue({
          mode: 'copy', resize: null, requests: { cards: true, publications: false }
        });
        mockElectronAPI.requestCardPrint.mockResolvedValue({ success: false, error: 'Sin acceso' });

        await run();

        expect(mockShowInfoModal.mock.calls[0][1])
          .toContain('No se ha podido solicitar la impresión de los carnets: Sin acceso');
      });

      test('should remember the ticks only when they changed', async () => {
        mockExportOptionsModal.show.mockResolvedValue({
          mode: 'copy', resize: null, requests: { cards: true, publications: false }
        });
        await run();
        expect(mockElectronAPI.setRepositoryExportRequests).not.toHaveBeenCalled();

        mockExportOptionsModal.show.mockResolvedValue({
          mode: 'copy', resize: null, requests: { cards: false, publications: true }
        });
        await run();
        expect(mockElectronAPI.setRepositoryExportRequests)
          .toHaveBeenCalledWith({ cards: false, publications: true });
      });

      test('should not remember anything when the dialog is cancelled', async () => {
        mockExportOptionsModal.show.mockResolvedValue(null);

        await manager.exportToRepository();

        expect(mockElectronAPI.setRepositoryExportRequests).not.toHaveBeenCalled();
      });
    });

    /**
     * Unlinking used to run over the whole project. Since the export normally
     * covers only the group on screen, answering yes dropped the links of
     * users whose photos never reached the repository.
     */
    test('should unlink only the users that were exported', async () => {
      mockExportOptionsModal.show.mockResolvedValue({ mode: 'copy', resize: null });
      mockConfirmModal.show.mockResolvedValue(true);

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: {
          total: 3,
          exported: 2,
          exportedUserIds: [7, 9],
          errors: [{ user: 'Sin NIA', error: 'Usuario sin identificador (NIA/DNI)' }]
        }
      });

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElectronAPI.clearCapturedImages).toHaveBeenCalledWith([7, 9]);
    });

    test('should say how many users the question is about', async () => {
      mockExportOptionsModal.show.mockResolvedValue({ mode: 'copy', resize: null });
      mockConfirmModal.show.mockResolvedValue(false);

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: { total: 3, exported: 2, exportedUserIds: [7, 9], errors: [] }
      });

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfirmModal.show).toHaveBeenCalledWith(expect.stringContaining('2 usuarios'));
    });

    test('should make clear that no image file is deleted', async () => {
      mockExportOptionsModal.show.mockResolvedValue({ mode: 'copy', resize: null });
      mockConfirmModal.show.mockResolvedValue(false);

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: { total: 1, exported: 1, exportedUserIds: [7], errors: [] }
      });

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfirmModal.show).toHaveBeenCalledWith(
        expect.stringContaining('No se borra ninguna imagen')
      );
    });

    test('should not unlink anything when the user declines', async () => {
      mockExportOptionsModal.show.mockResolvedValue({ mode: 'copy', resize: null });
      mockConfirmModal.show.mockResolvedValue(false);

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: { total: 1, exported: 1, exportedUserIds: [7], errors: [] }
      });

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElectronAPI.backupImageRelationships).not.toHaveBeenCalled();
      expect(mockElectronAPI.clearCapturedImages).not.toHaveBeenCalled();
    });

    test('should not show clear confirmation if no images exported', async () => {
      mockExportOptionsModal.show.mockResolvedValue({
        mode: 'copy',
        resize: null
      });

      mockElectronAPI.exportToRepository.mockResolvedValue({
        success: true,
        results: {
          total: 10,
          exported: 0,
          errors: []
        }
      });

      const promise = manager.exportToRepository();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfirmModal.show).not.toHaveBeenCalled();
    });
  });

  describe('describeExportScope()', () => {
    const withPhoto = (id) => ({ id, image_path: `photo${id}.jpg` });
    const withoutPhoto = (id) => ({ id, image_path: null });

    const valueFor = (scope, label) => {
      const rows = Array.isArray(scope) ? scope : scope.rows;
      const row = rows.find(r => r.label === label);
      return row ? row.value : undefined;
    };

    test('should count only the users that have a captured photo', () => {
      const rows = manager.describeExportScope(
        [withPhoto(1), withPhoto(2), withoutPhoto(3)],
        'al depósito'
      );

      expect(valueFor(rows, 'Imágenes a enviar al depósito')).toBe('2');
      expect(valueFor(rows, 'Usuarios sin foto capturada')).toBe('1');
    });

    test('should name the selected group', () => {
      manager.getGroupFilterLabel = () => '1CFMA - 1ACC CARROCERIA';

      const rows = manager.describeExportScope([withPhoto(1)], 'al depósito');

      expect(valueFor(rows, 'Se exportará')).toBe('1CFMA - 1ACC CARROCERIA');
    });

    test('should fall back to all groups when none is selected', () => {
      manager.getGroupFilterLabel = () => '';

      const rows = manager.describeExportScope([withPhoto(1)], 'al depósito');

      expect(valueFor(rows, 'Se exportará')).toBe('Todos los grupos');
    });

    test('should report the selection when it is what drives the export', () => {
      manager.getSelectionMode = () => true;
      manager.getSelectedUsers = () => new Set([1, 2, 3]);
      manager.getGroupFilterLabel = () => '1CFMA - 1ACC CARROCERIA';

      const rows = manager.describeExportScope([withPhoto(1)], 'al depósito');

      expect(valueFor(rows, 'Se exportará')).toBe('3 usuarios seleccionados');
    });

    /**
     * getCurrentFilters drops the group as soon as there is a search term, so
     * naming the group here would describe an export that is not happening.
     */
    test('should say the search ignores the group filter', () => {
      manager.getSearchTerm = () => 'garcia';
      manager.getGroupFilterLabel = () => '1CFMA - 1ACC CARROCERIA';

      const rows = manager.describeExportScope([withPhoto(1)], 'al depósito');

      expect(valueFor(rows, 'Se exportará')).toBe('Búsqueda "garcia", en todos los grupos');
    });

    test('should report the duplicates filter', () => {
      manager.getShowDuplicatesOnly = () => true;

      const rows = manager.describeExportScope([withPhoto(1)], 'al depósito');

      expect(valueFor(rows, 'Se exportará')).toBe('Usuarios con asignaciones duplicadas');
    });

    test('should word the destination for an export to a folder', async () => {
      manager.getCurrentUsers = () => [withPhoto(1), withoutPhoto(2)];
      manager.getGroupFilterLabel = () => '1CFMA - 1ACC CARROCERIA';
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\destino'] });
      mockExportOptionsModal.show.mockResolvedValue(null);

      await manager.exportImagesByID();

      expect(mockExportOptionsModal.show).toHaveBeenCalledWith([
        { label: 'Se exportará', value: '1CFMA - 1ACC CARROCERIA' },
        { label: 'Imágenes a enviar a la carpeta', value: '1' },
        { label: 'Usuarios sin foto capturada', value: '1' }
      ]);
    });

    /**
     * The repository breakdown must not leak into an export to a folder, where
     * "already in the repository" says nothing about the destination.
     */
    test('should not break a folder export down by repository', () => {
      const users = [
        { id: 1, image_path: 'a.jpg', has_repository_image: true },
        { id: 2, image_path: 'b.jpg', has_repository_image: false }
      ];

      const scope = manager.describeExportScope(users, 'a la carpeta');

      expect(valueFor(scope, 'Reemplazarán una foto existente')).toBeUndefined();
      expect(scope.note).toBeNull();
    });

    test('should summarise the export by full name too', async () => {
      manager.getCurrentUsers = () => [withPhoto(1), withPhoto(2), withoutPhoto(3)];
      manager.getGroupFilterLabel = () => 'Todos los grupos';
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\destino'] });
      mockExportOptionsModal.show.mockResolvedValue(null);

      await manager.exportImagesByName();

      expect(mockExportOptionsModal.show).toHaveBeenCalledWith([
        { label: 'Se exportará', value: 'Todos los grupos' },
        { label: 'Imágenes a enviar a la carpeta', value: '2' },
        { label: 'Usuarios sin foto capturada', value: '1' }
      ]);
    });

    describe('repository breakdown', () => {
      const users = [withPhoto(1), withPhoto(2), withPhoto(3), withoutPhoto(4)];

      test('should split the images into replacements and new ones', () => {
        const scope = manager.describeExportScope(users, 'al depósito', {
          repositoryCount: { withPhoto: 2, withoutPhoto: 1 }
        });

        expect(valueFor(scope, 'Reemplazarán una foto existente')).toBe('2');
        expect(valueFor(scope, 'Son fotos nuevas en el depósito')).toBe('1');
      });

      test('should still report when every photo is new', () => {
        const scope = manager.describeExportScope(users, 'al depósito', {
          repositoryCount: { withPhoto: 0, withoutPhoto: 3 }
        });

        expect(valueFor(scope, 'Reemplazarán una foto existente')).toBe('0');
        expect(valueFor(scope, 'Son fotos nuevas en el depósito')).toBe('3');
      });

      test('should warn that the figures may change and where replaced photos go', () => {
        const scope = manager.describeExportScope(users, 'al depósito', {
          repositoryCount: { withPhoto: 1, withoutPhoto: 2 }
        });

        expect(scope.note).toContain('de este momento');
        expect(scope.note).toContain('Reemplazadas');
      });

      test('should ignore what the list believes about the repository', () => {
        // has_repository_image is false for everyone when the Ver repository
        // options are off; the breakdown must not be built from it
        const scope = manager.describeExportScope(
          [{ id: 1, image_path: 'a.jpg', has_repository_image: false }],
          'al depósito',
          { repositoryCount: { withPhoto: 1, withoutPhoto: 0 } }
        );

        expect(valueFor(scope, 'Reemplazarán una foto existente')).toBe('1');
      });

      test('should leave the breakdown out when there is no count', () => {
        const scope = manager.describeExportScope(users, 'al depósito');

        expect(valueFor(scope, 'Reemplazarán una foto existente')).toBeUndefined();
        expect(scope.note).toBeNull();
      });
    });

    test('should hand the summary and the repository breakdown to the options dialog', async () => {
      manager.getCurrentUsers = () => [withPhoto(1), withPhoto(2), withoutPhoto(3)];
      manager.getGroupFilterLabel = () => '1CFMA - 1ACC CARROCERIA';
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: true, withPhoto: 1, withoutPhoto: 1 });
      mockExportOptionsModal.show.mockResolvedValue(null);

      await manager.exportToRepository();

      const [rows, note] = mockExportOptionsModal.show.mock.calls[0];
      expect(rows).toEqual([
        { label: 'Se exportará', value: '1CFMA - 1ACC CARROCERIA' },
        { label: 'Imágenes a enviar al depósito', value: '2' },
        { label: 'Usuarios sin foto capturada', value: '1' },
        { label: 'Reemplazarán una foto existente', value: '1' },
        { label: 'Son fotos nuevas en el depósito', value: '1' }
      ]);
      expect(note).toContain('Reemplazadas');
    });

    test('should ask the repository only about the users whose photo will be sent', async () => {
      manager.getCurrentUsers = () => [withPhoto(1), withoutPhoto(2)];
      mockExportOptionsModal.show.mockResolvedValue(null);

      await manager.exportToRepository();

      expect(mockElectronAPI.countRepositoryImages).toHaveBeenCalledWith([withPhoto(1)]);
    });

    test('should report a repository that cannot be read before showing the options', async () => {
      manager.getCurrentUsers = () => [withPhoto(1)];
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: false, error: 'No se ha configurado el depósito' });

      await manager.exportToRepository();

      expect(mockShowInfoModal).toHaveBeenCalledWith('Error', 'No se ha configurado el depósito');
      expect(mockExportOptionsModal.show).not.toHaveBeenCalled();
      expect(mockElectronAPI.exportToRepository).not.toHaveBeenCalled();
    });
  });

  describe('exportMissingPhotosPDF()', () => {
    const USERS = [
      { id: 1, nia: '1001', type: 'student', image_path: null },
      { id: 2, nia: '1002', type: 'student', image_path: '/img2.jpg' },
      { id: 3, nia: '1003', type: 'student', image_path: null }
    ];

    beforeEach(() => {
      mockGetters.getCurrentUsers.mockReturnValue(USERS);
      mockGetters.getAllUsers.mockReturnValue(USERS);
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/export/path'] });
      mockElectronAPI.exportMissingPhotosPDF = jest.fn().mockResolvedValue({
        success: true, fileName: 'Usuarios_sin_foto_capturada.pdf', total: 3, missing: 2, groups: 1
      });
    });

    test('should not export when project is closed', async () => {
      mockGetters.getProjectOpen.mockReturnValue(false);

      await manager.exportMissingPhotosPDF('captured');

      expect(mockShowOpenDialog).not.toHaveBeenCalled();
      expect(mockElectronAPI.exportMissingPhotosPDF).not.toHaveBeenCalled();
    });

    test('should send the scope users and label for the captured list', async () => {
      await manager.exportMissingPhotosPDF('captured');

      expect(mockElectronAPI.exportMissingPhotosPDF).toHaveBeenCalledWith({
        exportPath: '/export/path',
        users: USERS,
        source: 'captured',
        scopeLabel: expect.any(String)
      });
      expect(mockShowInfoModal).toHaveBeenCalledWith('Exportación completada', expect.stringContaining('2 de 3'));
    });

    test('should not ask for a folder when everyone has a captured photo', async () => {
      const withPhotos = USERS.map((user) => ({ ...user, image_path: '/x.jpg' }));
      mockGetters.getCurrentUsers.mockReturnValue(withPhotos);
      mockGetters.getAllUsers.mockReturnValue(withPhotos);

      await manager.exportMissingPhotosPDF('captured');

      expect(mockShowOpenDialog).not.toHaveBeenCalled();
      expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', expect.stringContaining('No hay usuarios sin foto capturada'));
    });

    test('should ask the repository, not the list, who lacks a repository photo', async () => {
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: true, withPhoto: 3, withoutPhoto: 0 });

      await manager.exportMissingPhotosPDF('repository');

      expect(mockElectronAPI.countRepositoryImages).toHaveBeenCalledWith(USERS);
      expect(mockShowOpenDialog).not.toHaveBeenCalled();
      expect(mockShowInfoModal).toHaveBeenCalledWith('Aviso', expect.stringContaining('sin foto en el depósito'));
    });

    test('should report an unreachable repository before asking for a folder', async () => {
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: false, error: 'No se ha configurado el depósito' });

      await manager.exportMissingPhotosPDF('repository');

      expect(mockShowOpenDialog).not.toHaveBeenCalled();
      expect(mockShowInfoModal).toHaveBeenCalledWith('Error', 'No se ha configurado el depósito');
    });

    test('should export the repository list when someone is missing', async () => {
      mockElectronAPI.countRepositoryImages.mockResolvedValue({ success: true, withPhoto: 1, withoutPhoto: 2 });

      await manager.exportMissingPhotosPDF('repository');

      expect(mockElectronAPI.exportMissingPhotosPDF).toHaveBeenCalledWith(expect.objectContaining({ source: 'repository' }));
      expect(mockCloseProgressModal).toHaveBeenCalled();
    });

    test('should do nothing when the folder dialog is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await manager.exportMissingPhotosPDF('captured');

      expect(mockElectronAPI.exportMissingPhotosPDF).not.toHaveBeenCalled();
    });

    test('should show the error of a failed export', async () => {
      mockElectronAPI.exportMissingPhotosPDF.mockResolvedValue({ success: false, error: 'disco lleno' });

      await manager.exportMissingPhotosPDF('captured');

      expect(mockCloseProgressModal).toHaveBeenCalled();
      expect(mockShowInfoModal).toHaveBeenCalledWith('Error', expect.stringContaining('disco lleno'));
    });
  });

  describe('exportGroupCoveragePDF()', () => {
    beforeEach(() => {
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/export/path'] });
      mockElectronAPI.exportGroupCoveragePDF = jest.fn().mockResolvedValue({
        success: true, fileName: 'Estadisticas_fotografias_por_grupo.pdf', includesRepository: true, repositoryNote: ''
      });
    });

    test('should not export when project is closed', async () => {
      mockGetters.getProjectOpen.mockReturnValue(false);

      await manager.exportGroupCoveragePDF();

      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    test('should export to the chosen folder', async () => {
      await manager.exportGroupCoveragePDF();

      expect(mockElectronAPI.exportGroupCoveragePDF).toHaveBeenCalledWith({ exportPath: '/export/path' });
      expect(mockShowInfoModal).toHaveBeenCalledWith('Exportación completada', 'Se ha generado Estadisticas_fotografias_por_grupo.pdf.');
    });

    test('should say why the repository is left out', async () => {
      mockElectronAPI.exportGroupCoveragePDF.mockResolvedValue({
        success: true, fileName: 'Estadisticas_fotografias_por_grupo.pdf', includesRepository: false, repositoryNote: 'no se ha configurado.'
      });

      await manager.exportGroupCoveragePDF();

      expect(mockShowInfoModal).toHaveBeenCalledWith('Exportación completada', expect.stringContaining('No incluye el depósito: no se ha configurado.'));
    });
  });

  describe('convertOptionsToAPI()', () => {
    test('should convert copy mode', () => {
      const options = {
        mode: 'copy',
        resize: null
      };

      const result = manager.convertOptionsToAPI(options);

      expect(result).toEqual({
        copyOriginal: true,
        resizeEnabled: false,
        boxSize: null,
        maxSizeKB: null
      });
    });

    test('should convert resize mode', () => {
      const options = {
        mode: 'resize',
        resize: { boxSize: 1024, maxSize: 600 }
      };

      const result = manager.convertOptionsToAPI(options);

      expect(result).toEqual({
        copyOriginal: false,
        resizeEnabled: true,
        boxSize: 1024,
        maxSizeKB: 600
      });
    });
  });
});
