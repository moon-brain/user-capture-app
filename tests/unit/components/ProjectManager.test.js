/**
 * Tests for ProjectManager
 */

const { ProjectManager } = require('../../../src/renderer/components/ProjectManager');

describe('ProjectManager', () => {
  let manager;
  let mockConfig;
  let mockElectronAPI;
  let mockNewProjectModal;

  beforeEach(() => {
    // Mock electron API
    mockElectronAPI = {
      showOpenDialog: jest.fn(),
      openProject: jest.fn(),
      getSelectedGroupFilter: jest.fn(),
      updateXML: jest.fn(),
      confirmUpdateXML: jest.fn()
    };

    // Mock new project modal
    mockNewProjectModal = {
      show: jest.fn()
    };

    // Mock DOM elements
    const mockSearchInput = {
      disabled: true,
      readOnly: true
    };

    const mockGroupFilter = {
      value: ''
    };

    const mockNoProjectPlaceholder = {
      classList: {
        add: jest.fn(),
        remove: jest.fn()
      }
    };

    // Mock config
    mockConfig = {
      setProjectOpen: jest.fn(),
      getProjectOpen: jest.fn(() => false),
      onLoadGroups: jest.fn(),
      onLoadUsers: jest.fn(),
      onLoadImages: jest.fn(),
      onGetCurrentFilters: jest.fn(() => ({})),
      onShowInfoModal: jest.fn(),
      onShowConfirmModal: jest.fn(),
      onShowProgressModal: jest.fn(),
      onCloseProgressModal: jest.fn(),
      onUpdateLastFilterValue: jest.fn(),
      onUpdateStatusBar: jest.fn(),
      onUpdateWindowTitle: jest.fn(),
      searchInput: mockSearchInput,
      groupFilter: mockGroupFilter,
      noProjectPlaceholder: mockNoProjectPlaceholder,
      newProjectModal: mockNewProjectModal,
      electronAPI: mockElectronAPI
    };

    // Create manager instance
    manager = new ProjectManager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with all callbacks', () => {
      expect(manager.onLoadGroups).toBe(mockConfig.onLoadGroups);
      expect(manager.onLoadUsers).toBe(mockConfig.onLoadUsers);
      expect(manager.onLoadImages).toBe(mockConfig.onLoadImages);
      expect(manager.onShowInfoModal).toBe(mockConfig.onShowInfoModal);
    });

    test('should use default callbacks if not provided', () => {
      const defaultManager = new ProjectManager({ electronAPI: mockElectronAPI });

      expect(typeof defaultManager.setProjectOpen).toBe('function');
      expect(typeof defaultManager.onLoadGroups).toBe('function');
      expect(typeof defaultManager.onShowInfoModal).toBe('function');
    });

    test('should store DOM elements', () => {
      expect(manager.searchInput).toBe(mockConfig.searchInput);
      expect(manager.groupFilter).toBe(mockConfig.groupFilter);
      expect(manager.noProjectPlaceholder).toBe(mockConfig.noProjectPlaceholder);
    });

    test('should store modal instance', () => {
      expect(manager.newProjectModal).toBe(mockNewProjectModal);
    });
  });

  describe('openNewProject()', () => {
    test('should call newProjectModal.show()', async () => {
      mockNewProjectModal.show.mockResolvedValue(true);
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });

      await manager.openNewProject();

      expect(mockNewProjectModal.show).toHaveBeenCalled();
    });

    test('should set project open and load data when modal returns true', async () => {
      mockNewProjectModal.show.mockResolvedValue(true);
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });

      await manager.openNewProject();

      expect(mockConfig.setProjectOpen).toHaveBeenCalledWith(true);
      expect(mockConfig.onLoadGroups).toHaveBeenCalled();
      expect(mockConfig.onLoadUsers).toHaveBeenCalled();
      expect(mockConfig.onLoadImages).toHaveBeenCalled();
    });

    test('should not load data if modal cancelled', async () => {
      mockNewProjectModal.show.mockResolvedValue(false);

      await manager.openNewProject();

      expect(mockConfig.setProjectOpen).not.toHaveBeenCalled();
      expect(mockConfig.onLoadGroups).not.toHaveBeenCalled();
    });

    test('should handle missing newProjectModal', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const managerWithoutModal = new ProjectManager({
        ...mockConfig,
        newProjectModal: null
      });

      await managerWithoutModal.openNewProject();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ProjectManager] NewProjectModal not configured'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('openExistingProject()', () => {
    test('should show open dialog', async () => {
      mockElectronAPI.showOpenDialog.mockResolvedValue({ canceled: true });

      await manager.openExistingProject();

      expect(mockElectronAPI.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory']
      });
    });

    test('should not proceed if dialog cancelled', async () => {
      mockElectronAPI.showOpenDialog.mockResolvedValue({ canceled: true });

      await manager.openExistingProject();

      expect(mockElectronAPI.openProject).not.toHaveBeenCalled();
    });

    test('should open project if folder selected', async () => {
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/project']
      });
      mockElectronAPI.openProject.mockResolvedValue({ success: true });
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });

      await manager.openExistingProject();

      expect(mockElectronAPI.openProject).toHaveBeenCalledWith('/path/to/project');
      expect(mockConfig.setProjectOpen).toHaveBeenCalledWith(true);
      expect(mockConfig.onLoadGroups).toHaveBeenCalled();
    });

    test('should show error if project open fails', async () => {
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/project']
      });
      mockElectronAPI.openProject.mockResolvedValue({
        success: false,
        error: 'Invalid project'
      });

      await manager.openExistingProject();

      expect(mockConfig.onShowInfoModal).toHaveBeenCalledWith(
        'Error',
        'Error al abrir el proyecto: Invalid project'
      );
      expect(mockConfig.setProjectOpen).not.toHaveBeenCalled();
    });
  });

  describe('loadProjectData()', () => {
    beforeEach(() => {
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });
    });

    test('should load groups, users, and images', async () => {
      await manager.loadProjectData();

      expect(mockConfig.onLoadGroups).toHaveBeenCalled();
      expect(mockConfig.onLoadUsers).toHaveBeenCalled();
      expect(mockConfig.onLoadImages).toHaveBeenCalled();
    });

    test('should load and apply saved group filter', async () => {
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({
        success: true,
        groupCode: 'GRP1'
      });

      await manager.loadProjectData();

      expect(mockConfig.groupFilter.value).toBe('GRP1');
      expect(mockConfig.onUpdateLastFilterValue).toHaveBeenCalledWith('GRP1');
    });

    test('should not apply filter if load fails', async () => {
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({
        success: false
      });

      await manager.loadProjectData();

      expect(mockConfig.groupFilter.value).toBe('');
    });

    test('should pass current filters to loadUsers', async () => {
      mockConfig.onGetCurrentFilters.mockReturnValue({ search: 'test' });

      await manager.loadProjectData();

      expect(mockConfig.onLoadUsers).toHaveBeenCalledWith({ search: 'test' });
    });

    test('should re-enable search input', async () => {
      await manager.loadProjectData();

      expect(mockConfig.searchInput.disabled).toBe(false);
      expect(mockConfig.searchInput.readOnly).toBe(false);
    });

    test('should update placeholder visibility', async () => {
      mockConfig.getProjectOpen.mockReturnValue(false);

      await manager.loadProjectData();

      // updateNoProjectPlaceholder is called - adds visible class when project not open
      expect(mockConfig.noProjectPlaceholder.classList.add).toHaveBeenCalledWith('visible');
    });

    test('should handle missing searchInput gracefully', async () => {
      const managerWithoutInput = new ProjectManager({
        ...mockConfig,
        searchInput: null
      });

      await expect(managerWithoutInput.loadProjectData()).resolves.not.toThrow();
    });
  });

  describe('updateNoProjectPlaceholder()', () => {
    test('should remove visible class if project is open', () => {
      mockConfig.getProjectOpen.mockReturnValue(true);

      manager.updateNoProjectPlaceholder();

      expect(mockConfig.noProjectPlaceholder.classList.remove).toHaveBeenCalledWith('visible');
      expect(mockConfig.noProjectPlaceholder.classList.add).not.toHaveBeenCalled();
    });

    test('should add visible class if project is not open', () => {
      mockConfig.getProjectOpen.mockReturnValue(false);

      manager.updateNoProjectPlaceholder();

      expect(mockConfig.noProjectPlaceholder.classList.add).toHaveBeenCalledWith('visible');
      expect(mockConfig.noProjectPlaceholder.classList.remove).not.toHaveBeenCalled();
    });

    test('should handle missing placeholder gracefully', () => {
      const managerWithoutPlaceholder = new ProjectManager({
        ...mockConfig,
        noProjectPlaceholder: null
      });

      expect(() => managerWithoutPlaceholder.updateNoProjectPlaceholder()).not.toThrow();
    });
  });

  describe('handleUpdateXML()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test('should show warning if no project open', async () => {
      mockConfig.getProjectOpen.mockReturnValue(false);

      await manager.handleUpdateXML();

      expect(mockConfig.onShowInfoModal).toHaveBeenCalledWith(
        'Aviso',
        'Debes abrir o crear un proyecto primero'
      );
      expect(mockElectronAPI.showOpenDialog).not.toHaveBeenCalled();
    });

    test('should show file dialog if project is open', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({ canceled: true });

      await manager.handleUpdateXML();

      expect(mockElectronAPI.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openFile'],
        filters: [{ name: 'XML Files', extensions: ['xml'] }],
        title: 'Seleccionar nuevo archivo XML'
      });
    });

    test('should not proceed if dialog cancelled', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({ canceled: true });

      await manager.handleUpdateXML();

      expect(mockElectronAPI.updateXML).not.toHaveBeenCalled();
    });

    test('should analyze XML and show progress', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 5, toUpdate: 3, toDelete: 2, toDeleteWithImage: 1, toDeleteWithoutImage: 1 },
        groups: [],
        newUsersMap: {},
        deletedUsers: [],
        currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(false); // User cancels

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onShowProgressModal).toHaveBeenCalledWith(
        'Actualizando XML',
        'Analizando cambios...'
      );
      expect(mockElectronAPI.updateXML).toHaveBeenCalledWith('/path/to/new.xml');
      expect(mockConfig.onCloseProgressModal).toHaveBeenCalled();
    });

    test('should show error if XML analysis fails', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/bad.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: false,
        error: 'Invalid XML format'
      });

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onCloseProgressModal).toHaveBeenCalled();
      expect(mockConfig.onShowInfoModal).toHaveBeenCalledWith(
        'Error',
        'Error al analizar el XML: Invalid XML format'
      );
    });

    test('should show confirmation with change summary', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 5, toUpdate: 3, toDelete: 2, toDeleteWithImage: 1, toDeleteWithoutImage: 1 },
        groups: [],
        newUsersMap: {},
        deletedUsers: [],
        currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(false);

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onShowConfirmModal).toHaveBeenCalled();
      const confirmMessage = mockConfig.onShowConfirmModal.mock.calls[0][0];
      expect(confirmMessage).toContain('Usuarios nuevos: 5');
      expect(confirmMessage).toContain('Usuarios actualizados: 3');
      expect(confirmMessage).toContain('Usuarios eliminados: 2');
      expect(confirmMessage).toContain('1 usuario(s) con imagen serán movidos');
      expect(confirmMessage).toContain('1 usuario(s) sin imagen serán eliminados permanentemente');
    });

    describe('an XML from another course', () => {
      const confirmMessageFor = async (academicYear) => {
        mockConfig.getProjectOpen.mockReturnValue(true);
        mockElectronAPI.showOpenDialog.mockResolvedValue({
          canceled: false,
          filePaths: ['/path/to/new.xml']
        });
        mockElectronAPI.updateXML.mockResolvedValue({
          success: true,
          changes: { toAdd: 0, toUpdate: 3, toDelete: 0, toDeleteWithImage: 0, toDeleteWithoutImage: 0 },
          groups: [],
          newUsersMap: {},
          deletedUsers: [],
          currentUsers: [],
          academicYear
        });
        mockConfig.onShowConfirmModal.mockResolvedValue(false);

        const promise = manager.handleUpdateXML();
        await jest.runAllTimersAsync();
        await promise;

        return mockConfig.onShowConfirmModal.mock.calls[0][0];
      };

      test('should warn that the project is for a different course', async () => {
        const message = await confirmMessageFor({ current: 2025, incoming: 2026 });

        expect(message).toContain('Este XML es del curso 2026-2027 y el proyecto es del curso 2025-2026');
        expect(message).toContain('crear un proyecto nuevo');
      });

      test('should not warn when the course is the same', async () => {
        const message = await confirmMessageFor({ current: 2026, incoming: 2026 });

        expect(message).not.toContain('curso');
      });

      test('should not warn when the project never recorded its course', async () => {
        const message = await confirmMessageFor({ current: null, incoming: 2026 });

        expect(message).not.toContain('curso');
      });

      test('should hand the XML course over when applying', async () => {
        mockConfig.getProjectOpen.mockReturnValue(true);
        mockElectronAPI.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/path/to/new.xml'] });
        mockElectronAPI.updateXML.mockResolvedValue({
          success: true,
          changes: { toAdd: 0, toUpdate: 0, toDelete: 0, toDeleteWithImage: 0, toDeleteWithoutImage: 0 },
          groups: [],
          newUsersMap: {},
          deletedUsers: [],
          currentUsers: [],
          academicYear: { current: 2025, incoming: 2026 }
        });
        mockConfig.onShowConfirmModal.mockResolvedValue(true);
        mockElectronAPI.confirmUpdateXML.mockResolvedValue({ success: false, error: 'x' });

        const promise = manager.handleUpdateXML();
        await jest.runAllTimersAsync();
        await promise;

        expect(mockElectronAPI.confirmUpdateXML).toHaveBeenCalledWith(
          expect.objectContaining({ academicYear: 2026 })
        );
      });
    });

    test('should not apply changes if user cancels confirmation', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 5, toUpdate: 3, toDelete: 2, toDeleteWithImage: 0, toDeleteWithoutImage: 2 },
        groups: [],
        newUsersMap: {},
        deletedUsers: [],
        currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(false);

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElectronAPI.confirmUpdateXML).not.toHaveBeenCalled();
    });

    test('should apply changes if user confirms', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      const updateData = {
        groups: ['G1'],
        newUsersMap: { 1: { name: 'User1' } },
        deletedUsers: [2],
        currentUsers: [{ id: 3 }],
        xmlPath: '/path/to/new.xml'
      };
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 1, toUpdate: 0, toDelete: 1, toDeleteWithImage: 0, toDeleteWithoutImage: 1 },
        ...updateData
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(true);
      mockElectronAPI.confirmUpdateXML.mockResolvedValue({
        success: true,
        results: { added: 1, updated: 0, movedToDeleted: 0, permanentlyDeleted: 1 }
      });
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onShowProgressModal).toHaveBeenCalledWith(
        'Actualizando XML',
        'Aplicando cambios...'
      );
      expect(mockElectronAPI.confirmUpdateXML).toHaveBeenCalledWith({ ...updateData, academicYear: null });
      expect(mockConfig.onCloseProgressModal).toHaveBeenCalled();
    });

    test('should reload project data after successful update', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 1, toUpdate: 0, toDelete: 0, toDeleteWithImage: 0, toDeleteWithoutImage: 0 },
        groups: [],
        newUsersMap: {},
        deletedUsers: [],
        currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(true);
      mockElectronAPI.confirmUpdateXML.mockResolvedValue({
        success: true,
        results: { added: 1, updated: 0, movedToDeleted: 0, permanentlyDeleted: 0 }
      });
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onLoadGroups).toHaveBeenCalled();
      expect(mockConfig.onLoadUsers).toHaveBeenCalled();
      expect(mockConfig.onLoadImages).toHaveBeenCalled();
    });

    test('should show success message after update', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 2, toUpdate: 1, toDelete: 1, toDeleteWithImage: 1, toDeleteWithoutImage: 0 },
        groups: [],
        newUsersMap: {},
        deletedUsers: [],
        currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(true);
      mockElectronAPI.confirmUpdateXML.mockResolvedValue({
        success: true,
        results: { added: 2, updated: 1, movedToDeleted: 1, permanentlyDeleted: 0 }
      });
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onShowInfoModal).toHaveBeenCalledWith(
        'Actualización completada',
        expect.stringContaining('Usuarios añadidos: 2')
      );
      const message = mockConfig.onShowInfoModal.mock.calls[0][1];
      expect(message).toContain('Usuarios actualizados: 1');
      expect(message).toContain('Usuarios movidos a Eliminados: 1');
      expect(message).toContain('Usuarios eliminados permanentemente: 0');
    });

    test('should say when the XML could not be shared with the other teams', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/path/to/new.xml'] });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 0, toUpdate: 1, toDelete: 0, toDeleteWithImage: 0, toDeleteWithoutImage: 0 },
        groups: [], newUsersMap: {}, deletedUsers: [], currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(true);
      mockElectronAPI.confirmUpdateXML.mockResolvedValue({
        success: true,
        results: { added: 0, updated: 1, movedToDeleted: 0, permanentlyDeleted: 0 },
        sharedXml: { status: 'repository-unavailable' }
      });
      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({ success: false });

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onShowInfoModal.mock.calls[0][1]).toContain(
        'El XML no se ha publicado para los demás equipos: el depósito no está disponible.'
      );
    });

    test('should show error if update application fails', async () => {
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 1, toUpdate: 0, toDelete: 0, toDeleteWithImage: 0, toDeleteWithoutImage: 0 },
        groups: [],
        newUsersMap: {},
        deletedUsers: [],
        currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(true);
      mockElectronAPI.confirmUpdateXML.mockResolvedValue({
        success: false,
        error: 'Database error'
      });

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockConfig.onShowInfoModal).toHaveBeenCalledWith(
        'Error',
        'Error al aplicar cambios: Database error'
      );
    });
  });

  describe('describeSharedXml()', () => {
    const describe_ = (sharedXml) => ProjectManager.describeSharedXml(sharedXml);

    test.each([
      ['published', 'El XML se ha publicado en el depósito para los demás equipos.'],
      ['already', 'Este XML ya estaba publicado en el depósito.'],
      ['no-repository', 'El XML no se ha publicado para los demás equipos: el proyecto no tiene depósito configurado.'],
      ['repository-unavailable', 'El XML no se ha publicado para los demás equipos: el depósito no está disponible.'],
      ['changed', 'El XML no se ha publicado para los demás equipos: el archivo ha cambiado desde que se analizó.']
    ])('should explain %s', (status, text) => {
      expect(describe_({ status })).toBe(text);
    });

    test('should pass on why writing failed', () => {
      expect(describe_({ status: 'failed', error: 'EACCES: permission denied' }))
        .toBe('El XML no se ha publicado para los demás equipos: EACCES: permission denied.');
    });

    test('should say nothing when there is nothing to say', () => {
      expect(describe_(undefined)).toBeNull();
      expect(describe_({ status: 'not-applied' })).toBeNull();
    });
  });

  describe('updateCallbacks()', () => {
    test('should update callbacks', () => {
      const newCallback = jest.fn();

      manager.updateCallbacks({
        onLoadGroups: newCallback
      });

      expect(manager.onLoadGroups).toBe(newCallback);
    });

    test('should only update provided callbacks', () => {
      const originalCallback = manager.onLoadUsers;
      const newCallback = jest.fn();

      manager.updateCallbacks({
        onLoadGroups: newCallback
      });

      expect(manager.onLoadGroups).toBe(newCallback);
      expect(manager.onLoadUsers).toBe(originalCallback);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty file paths array', async () => {
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: []
      });

      await manager.openExistingProject();

      expect(mockElectronAPI.openProject).not.toHaveBeenCalled();
    });

    test('should handle missing group filter element', async () => {
      const managerWithoutFilter = new ProjectManager({
        ...mockConfig,
        groupFilter: null
      });

      mockElectronAPI.getSelectedGroupFilter.mockResolvedValue({
        success: true,
        groupCode: 'GRP1'
      });

      await expect(managerWithoutFilter.loadProjectData()).resolves.not.toThrow();
    });

    test('should handle update XML with zero changes', async () => {
      jest.useFakeTimers();
      mockConfig.getProjectOpen.mockReturnValue(true);
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/new.xml']
      });
      mockElectronAPI.updateXML.mockResolvedValue({
        success: true,
        changes: { toAdd: 0, toUpdate: 0, toDelete: 0, toDeleteWithImage: 0, toDeleteWithoutImage: 0 },
        groups: [],
        newUsersMap: {},
        deletedUsers: [],
        currentUsers: []
      });
      mockConfig.onShowConfirmModal.mockResolvedValue(false);

      const promise = manager.handleUpdateXML();
      await jest.runAllTimersAsync();
      await promise;
      jest.useRealTimers();

      const confirmMessage = mockConfig.onShowConfirmModal.mock.calls[0][0];
      expect(confirmMessage).toContain('Usuarios nuevos: 0');
      expect(confirmMessage).not.toContain('usuario(s) con imagen serán movidos');
      expect(confirmMessage).not.toContain('usuario(s) sin imagen serán eliminados');
    });
  });
});
