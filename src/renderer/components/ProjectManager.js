/**
 * ProjectManager - Manages project lifecycle operations
 *
 * Centralized manager for project-related operations including:
 * - Opening and creating projects
 * - Loading project data (groups, users, images)
 * - Updating XML and handling data changes
 * - Managing project state
 *
 * Features:
 * - Delegates to NewProjectModal for project creation
 * - Handles project opening via folder selection
 * - Loads and restores user preferences (group filter)
 * - Updates project placeholder visibility
 * - Manages XML update flow with confirmation
 * - Configurable callbacks for state updates
 */

(function(global) {
  'use strict';

  class ProjectManager {
    constructor(config = {}) {
      // State setters
      this.setProjectOpen = config.setProjectOpen || ((value) => {});
      this.setCurrentUsers = config.setCurrentUsers || ((users) => {});
      this.setAllUsers = config.setAllUsers || ((users) => {});
      this.setCurrentGroups = config.setCurrentGroups || ((groups) => {});
      this.setSelectedUser = config.setSelectedUser || ((user) => {});

      // State getters
      this.getProjectOpen = config.getProjectOpen || (() => false);

      // Callbacks
      this.onLoadGroups = config.onLoadGroups || (async () => {});
      this.onLoadUsers = config.onLoadUsers || (async (filters) => {});
      this.onLoadImages = config.onLoadImages || (async () => {});
      this.onUpdateStatusBar = config.onUpdateStatusBar || (async () => {});
      this.onUpdateWindowTitle = config.onUpdateWindowTitle || (() => {});
      this.onGetCurrentFilters = config.onGetCurrentFilters || (() => ({}));
      this.onShowInfoModal = config.onShowInfoModal || ((title, message) => {});
      this.onShowConfirmModal = config.onShowConfirmModal || (async (message) => false);
      this.onShowProgressModal = config.onShowProgressModal || ((title, message) => {});
      this.onCloseProgressModal = config.onCloseProgressModal || (() => {});
      this.onClearImages = config.onClearImages || (() => {});
      this.onUpdateLastFilterValue = config.onUpdateLastFilterValue || ((value) => {});
      this.onResetGroupFilterLock = config.onResetGroupFilterLock || (() => {});
      this.onProjectDataLoaded = config.onProjectDataLoaded || (() => {});

      // DOM elements
      this.searchInput = config.searchInput;
      this.groupFilter = config.groupFilter;
      this.noProjectPlaceholder = config.noProjectPlaceholder;

      // Modal instances
      this.newProjectModal = config.newProjectModal;

      // IPC API
      this.electronAPI = config.electronAPI || window.electronAPI;
    }

    /**
     * Open new project modal and create project
     * @returns {Promise<void>}
     */
    async openNewProject() {
      if (!this.newProjectModal) {
        console.error('[ProjectManager] NewProjectModal not configured');
        return;
      }

      // NewProjectModal class handles the entire flow
      const result = await this.newProjectModal.show();

      if (result) {
        // Project created successfully - modal already updated store
        this.setProjectOpen(true);
        await this.loadProjectData();
      }
    }

    /**
     * Open existing project via folder selection
     * @returns {Promise<void>}
     */
    async openExistingProject() {
      const result = await this.electronAPI.showOpenDialog({
        properties: ['openDirectory']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const openResult = await this.electronAPI.openProject(result.filePaths[0]);

        if (openResult.success) {
          this.setProjectOpen(true);
          await this.loadProjectData();
        } else {
          this.onShowInfoModal('Error', 'Error al abrir el proyecto: ' + openResult.error);
        }
      }
    }

    /**
     * Close the current project
     * Clears all project data and resets UI state
     */
    async closeProject() {
      // Call main process to close project (database, folder watcher, etc.)
      const result = await this.electronAPI.closeProject();

      if (!result.success) {
        console.error('[ProjectManager] Error closing project:', result.error);
        return;
      }

      // Clear all project data
      this.setCurrentUsers([]);
      this.setAllUsers([]);
      this.setCurrentGroups([]);
      this.setSelectedUser(null);

      // Clear images
      this.onClearImages();

      // Reset filters
      if (this.searchInput) {
        this.searchInput.value = '';
        this.searchInput.disabled = true;
        this.searchInput.readOnly = true;
      }

      if (this.groupFilter) {
        this.groupFilter.innerHTML = '<option value="">Todos los grupos</option>';
        this.groupFilter.value = '';
      }
      // The search was cleared above, so the group filter is no longer locked
      this.onResetGroupFilterLock();

      // Set project as closed
      this.setProjectOpen(false);

      // Update status bar (window title is already updated in main process)
      this.onUpdateStatusBar();

      // Show no project placeholder
      this.updateNoProjectPlaceholder();

      console.log('[ProjectManager] Project closed');
    }

    /**
     * Load all project data (groups, users, images)
     * @returns {Promise<void>}
     */
    async loadProjectData() {
      // Update status bar first
      await this.onUpdateStatusBar();

      await this.onLoadGroups();

      // Load saved group filter
      const filterResult = await this.electronAPI.getSelectedGroupFilter();
      if (filterResult.success && filterResult.groupCode && this.groupFilter) {
        this.groupFilter.value = filterResult.groupCode;
        // Update lastFilterValue to sync with restored filter value
        this.onUpdateLastFilterValue(filterResult.groupCode);
      }

      await this.onLoadUsers(this.onGetCurrentFilters());
      await this.onLoadImages();

      // Re-enable search input after data load
      if (this.searchInput) {
        this.searchInput.disabled = false;
        this.searchInput.readOnly = false;
      }

      // Update placeholder visibility
      this.updateNoProjectPlaceholder();

      // Every opening, creation and XML update ends here
      this.onProjectDataLoaded();
    }

    /**
     * Update no project placeholder visibility
     */
    updateNoProjectPlaceholder() {
      if (!this.noProjectPlaceholder) {
        return;
      }

      if (this.getProjectOpen()) {
        this.noProjectPlaceholder.classList.remove('visible');
      } else {
        this.noProjectPlaceholder.classList.add('visible');
      }
    }

    /**
     * Handle XML update flow
     *
     * From the menu it asks for the file. The notice of a more recent XML in
     * the repository passes the published one, with a line saying where it
     * comes from; from there it is the same analysis and confirmation.
     *
     * @param {Object} [published] - { filePath, source } of a published XML
     * @returns {Promise<void>}
     */
    async handleUpdateXML(published = null) {
      if (!this.getProjectOpen()) {
        this.onShowInfoModal('Aviso', 'Debes abrir o crear un proyecto primero');
        return;
      }

      let xmlPath;
      if (published && typeof published.filePath === 'string') {
        xmlPath = published.filePath;
      } else {
        // Select new XML file
        const result = await this.electronAPI.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'XML Files', extensions: ['xml'] }],
          title: 'Seleccionar nuevo archivo XML'
        });

        if (result.canceled || result.filePaths.length === 0) {
          return;
        }

        xmlPath = result.filePaths[0];
      }

      // Show progress modal
      this.onShowProgressModal('Actualizando XML', 'Analizando cambios...');

      // Call update-xml to analyze changes
      const updateResult = await this.electronAPI.updateXML(xmlPath);

      if (!updateResult.success) {
        // Wait a moment to show 100% progress
        await new Promise(resolve => setTimeout(resolve, 500));
        this.onCloseProgressModal();
        this.onShowInfoModal('Error', 'Error al analizar el XML: ' + updateResult.error);
        return;
      }

      // Wait a moment to show 100% progress
      await new Promise(resolve => setTimeout(resolve, 500));
      this.onCloseProgressModal();

      // Show confirmation dialog with summary
      const changes = updateResult.changes;
      let message = '';

      // Updating last year's project with the new course's roll works, but
      // everyone who left goes to Eliminados or is deleted: warn first
      const { current, incoming } = updateResult.academicYear || {};
      if (current && incoming && current !== incoming) {
        message += `⚠ Este XML es del curso ${incoming}-${incoming + 1} y el proyecto es del curso ${current}-${current + 1}.\n`;
        message += 'Para empezar un curso nuevo, lo habitual es crear un proyecto nuevo con su XML.\n\n';
      }

      if (published && published.source) {
        message += `${published.source}\n\n`;
      }

      message += 'Se han detectado los siguientes cambios:\n\n';
      message += `Usuarios nuevos: ${changes.toAdd}\n`;
      message += `Usuarios actualizados: ${changes.toUpdate}\n`;
      message += `Usuarios eliminados: ${changes.toDelete}\n\n`;

      if (changes.toDeleteWithImage > 0) {
        message += `- ${changes.toDeleteWithImage} usuario(s) con imagen serán movidos al grupo "⚠ Eliminados"\n`;
      }
      if (changes.toDeleteWithoutImage > 0) {
        message += `- ${changes.toDeleteWithoutImage} usuario(s) sin imagen serán eliminados permanentemente\n`;
      }

      message += '\n¿Deseas continuar con la actualización?';

      const confirmed = await this.onShowConfirmModal(message);

      if (confirmed) {
        // Show progress modal
        this.onShowProgressModal('Actualizando XML', 'Aplicando cambios...');

        // Apply the update
        const confirmResult = await this.electronAPI.confirmUpdateXML({
          groups: updateResult.groups,
          newUsersMap: updateResult.newUsersMap,
          deletedUsers: updateResult.deletedUsers,
          currentUsers: updateResult.currentUsers,
          xmlPath: updateResult.xmlPath,
          academicYear: updateResult.academicYear?.incoming ?? null
        });

        // Wait a moment to show 100% progress
        await new Promise(resolve => setTimeout(resolve, 500));
        this.onCloseProgressModal();

        if (confirmResult.success) {
          const results = confirmResult.results;
          let successMessage = 'Actualización completada exitosamente:\n\n';
          successMessage += `Usuarios añadidos: ${results.added}\n`;
          successMessage += `Usuarios actualizados: ${results.updated}\n`;
          successMessage += `Usuarios movidos a Eliminados: ${results.movedToDeleted}\n`;
          successMessage += `Usuarios eliminados permanentemente: ${results.permanentlyDeleted}`;

          const sharedNote = ProjectManager.describeSharedXml(confirmResult.sharedXml);
          if (sharedNote) {
            successMessage += `

${sharedNote}`;
          }

          // Reload project data first
          await this.loadProjectData();

          // Show info modal
          this.onShowInfoModal('Actualización completada', successMessage);
        } else {
          this.onShowInfoModal('Error', 'Error al aplicar cambios: ' + confirmResult.error);
        }
      }
    }

    /**
     * What happened to the XML shared with the other teams, as the update
     * message says it; null when there is nothing worth saying
     * @param {Object|undefined} sharedXml - { status, fileName, error } from confirm-update-xml
     * @returns {string|null}
     */
    static describeSharedXml(sharedXml) {
      if (!sharedXml) return null;
      const notShared = 'El XML no se ha publicado para los demás equipos';
      switch (sharedXml.status) {
        case 'published':
          return 'El XML se ha publicado en el depósito para los demás equipos.';
        case 'already':
          return 'Este XML ya estaba publicado en el depósito.';
        case 'no-repository':
          return `${notShared}: el proyecto no tiene depósito configurado.`;
        case 'repository-unavailable':
          return `${notShared}: el depósito no está disponible.`;
        case 'changed':
          return `${notShared}: el archivo ha cambiado desde que se analizó.`;
        case 'failed':
          return `${notShared}: ${sharedXml.error || 'error desconocido'}.`;
        default:
          return null;
      }
    }

    /**
     * Update callbacks
     * @param {Object} callbacks - New callbacks
     */
    updateCallbacks(callbacks = {}) {
      if (callbacks.onLoadGroups) this.onLoadGroups = callbacks.onLoadGroups;
      if (callbacks.onLoadUsers) this.onLoadUsers = callbacks.onLoadUsers;
      if (callbacks.onLoadImages) this.onLoadImages = callbacks.onLoadImages;
      if (callbacks.onUpdateStatusBar) this.onUpdateStatusBar = callbacks.onUpdateStatusBar;
      if (callbacks.onUpdateWindowTitle) this.onUpdateWindowTitle = callbacks.onUpdateWindowTitle;
      if (callbacks.onGetCurrentFilters) this.onGetCurrentFilters = callbacks.onGetCurrentFilters;
      if (callbacks.onShowInfoModal) this.onShowInfoModal = callbacks.onShowInfoModal;
      if (callbacks.onShowConfirmModal) this.onShowConfirmModal = callbacks.onShowConfirmModal;
      if (callbacks.onShowProgressModal) this.onShowProgressModal = callbacks.onShowProgressModal;
      if (callbacks.onCloseProgressModal) this.onCloseProgressModal = callbacks.onCloseProgressModal;
      if (callbacks.onClearImages) this.onClearImages = callbacks.onClearImages;
    }
  }

  // Export (for tests and browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProjectManager };
  } else if (typeof window !== 'undefined') {
    global.ProjectManager = ProjectManager;
  }
})(typeof window !== 'undefined' ? window : global);
