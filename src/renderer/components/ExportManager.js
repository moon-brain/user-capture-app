/**
 * ExportManager - Manages export operations for users, CSV, and images
 *
 * Handles all export functionality including:
 * - CSV export
 * - Image export by ID
 * - Image export by name
 * - Export to repository (Google Drive)
 * - Determining which users to export (selection, view, duplicates)
 *
 * Features:
 * - Uses ExportOptionsModal for user input
 * - Shows progress during operations
 * - Handles results and errors
 */

(function(global) {
  'use strict';

  const NO_USERS_TO_EXPORT = 'No hay usuarios que exportar con la selección y los filtros actuales.';

  class ExportManager {
    constructor(config = {}) {
      // Required dependencies
      this.exportOptionsModal = config.exportOptionsModal; // ExportOptionsModal instance
      this.exportScopeModal = config.exportScopeModal; // ExportScopeModal instance
      this.inventoryExportOptionsModal = config.inventoryExportOptionsModal; // InventoryExportOptionsModal instance
      this.confirmModal = config.confirmModal; // ConfirmModal instance
      this.showProgressModal = config.showProgressModal; // Function to show progress
      this.closeProgressModal = config.closeProgressModal; // Function to close progress
      this.showInfoModal = config.showInfoModal; // Function to show info/error
      this.showOpenDialog = config.showOpenDialog; // Function to show folder picker

      // Required state getters
      this.getProjectOpen = config.getProjectOpen; // Function returning projectOpen boolean
      this.getSelectionMode = config.getSelectionMode; // Function returning selectionMode boolean
      this.getSelectedUsers = config.getSelectedUsers; // Function returning Set of selected user IDs
      this.getDisplayedUsers = config.getDisplayedUsers; // Function returning displayed users array
      this.getCurrentUsers = config.getCurrentUsers; // Function returning current users array
      this.getAllUsers = config.getAllUsers || (() => []); // Function returning every user of the project
      this.getShowDuplicatesOnly = config.getShowDuplicatesOnly; // Function returning showDuplicatesOnly boolean
      this.getShowCardPrintRequestsOnly = config.getShowCardPrintRequestsOnly; // Function returning showCardPrintRequestsOnly boolean
      this.getShowPublicationRequestsOnly = config.getShowPublicationRequestsOnly; // Function returning showPublicationRequestsOnly boolean
      this.getCurrentFilters = config.getCurrentFilters; // Function returning current filters object
      this.getGroupFilterLabel = config.getGroupFilterLabel || (() => ''); // Function returning the selected group's label
      this.getGroupFilter = config.getGroupFilter || (() => ''); // Function returning the selected group's code
      this.getSearchTerm = config.getSearchTerm || (() => ''); // Function returning the active search term

      // Required callbacks
      this.onExportComplete = config.onExportComplete || (() => {}); // Called after successful export

      // Required Electron API methods
      this.electronAPI = config.electronAPI; // window.electronAPI reference
    }

    /**
     * Get users to export based on current selection/view
     * @returns {Array} Users to export
     */
    getUsersToExport() {
      const selectionMode = this.getSelectionMode();
      const selectedUsers = this.getSelectedUsers();
      const displayedUsers = this.getDisplayedUsers();

      // The selection wins: those are the users marked one by one
      if (selectionMode && selectedUsers && selectedUsers.size > 0) {
        return (displayedUsers || []).filter(user => selectedUsers.has(user.id));
      }

      // Whoever is on the list, which the group, the search and the filters of
      // the Ver menu already decided. Taking the group instead meant that with
      // Ver > Carnets solicitados on, the export covered people the screen was
      // not showing: the whole project, or the whole group.
      return Array.isArray(displayedUsers) ? displayedUsers : this.getCurrentUsers();
    }

    /**
     * The scopes an export can cover, with the users in each
     *
     * Only the ones that mean something right now, and never two that hold the
     * same people: with no filter on, "lo que muestra la lista" already is the
     * whole project, and offering both would be asking a question with one
     * answer written twice.
     *
     * @returns {Array<{id: string, label: string, users: Array, count: number}>}
     */
    buildScopeOptions() {
      const scopes = [];

      const add = (id, label, users) => {
        if (!Array.isArray(users) || users.length === 0) {
          return;
        }

        const key = users.map((user) => user.id).sort().join(',');

        if (scopes.some((scope) => scope.key === key)) {
          return;
        }

        scopes.push({ id, label, users, count: users.length, key });
      };

      const displayed = this.getDisplayedUsers();
      const onScreen = Array.isArray(displayed) ? displayed : this.getCurrentUsers();
      const selectedUsers = this.getSelectedUsers();
      const everyone = this.getAllUsers();
      const groupCode = this.getGroupFilter();

      if (this.getSelectionMode() && selectedUsers && selectedUsers.size > 0) {
        add('selection', `${selectedUsers.size} usuarios seleccionados`,
          (onScreen || []).filter((user) => selectedUsers.has(user.id)));
      }

      add('displayed', this.describeListLabel(), onScreen);

      if (groupCode) {
        add('group', `Todo el grupo ${this.getGroupFilterLabel() || groupCode}`,
          (everyone || []).filter((user) => user.group_code === groupCode));
      }

      add('project', 'Todos los usuarios del proyecto', everyone);

      return scopes;
    }

    /**
     * Ask which users the export covers
     *
     * Skipped when there is nothing to ask: with no selection and no filters
     * every answer is the same list, and a dialog with a single option only
     * costs a click.
     *
     * @returns {Promise<{id: string, label: string, users: Array}|null>} null
     *   when cancelled or when there is nobody to export
     */
    async chooseExportScope() {
      const scopes = this.buildScopeOptions();

      if (scopes.length === 0) {
        await this.ensureUsersToExport([]);
        return null;
      }

      if (scopes.length === 1) {
        return scopes[0];
      }

      const chosen = await this.exportScopeModal.show(
        scopes.map(({ id, label, count }) => ({ id, label, count })),
        'displayed'
      );

      return scopes.find((scope) => scope.id === chosen) || null;
    }

    /**
     * Check if project is open
     * @returns {boolean} True if project is open
     */
    checkProjectOpen() {
      if (!this.getProjectOpen()) {
        this.showInfoModal('Aviso', 'Debes abrir o crear un proyecto primero');
        return false;
      }
      return true;
    }

    /**
     * Stop an export that has nobody to export, before any dialog opens
     *
     * Reaching the main process with an empty list used to export the whole
     * project; it now refuses, but the user should hear it here, not after
     * choosing a folder.
     *
     * @param {Array} users
     * @param {string} [message]
     * @returns {Promise<boolean>} Whether there is anyone to export
     */
    async ensureUsersToExport(users, message = NO_USERS_TO_EXPORT) {
      if (users && users.length > 0) return true;

      await this.showInfoModal('Aviso', message);
      return false;
    }

    /**
     * Export CSV file
     */
    async exportCSV() {
      if (!this.checkProjectOpen()) return;

      // Who this export covers, asked when the answer is not obvious
      const scope = await this.chooseExportScope();
      if (!scope) return;
      const usersToExport = scope.users;

      // Show folder picker
      const result = await this.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta para guardar el CSV'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = result.filePaths[0];
        const exportResult = await this.electronAPI.exportCSV(folderPath, usersToExport);

        if (exportResult.success) {
          // Check if any of the exported users have card print requests BEFORE showing success modal
          // Use the exportedUserIds from the backend (users that actually were exported)
          if (exportResult.exportedUserIds && exportResult.exportedUserIds.length > 0) {
            await this.checkAndMarkCardsAsPrinted(exportResult.exportedUserIds);
          }

          // Show success message after card print check
          let message = `CSV exportado correctamente: ${exportResult.filename}\n\n`;
          message += `${exportResult.exported} usuarios exportados`;

          if (exportResult.ignored > 0) {
            message += `\n${exportResult.ignored} usuarios ignorados (sin imagen en el depósito)`;
          }

          this.showInfoModal('Exportación exitosa', message);
        } else {
          this.showInfoModal('Error', 'Error al exportar el CSV: ' + exportResult.error);
        }
      }
    }

    /**
     * Check if exported users have card print requests and ask to mark as printed
     * @param {Array} exportedUserIds - IDs of users that were exported
     */
    async checkAndMarkCardsAsPrinted(exportedUserIds) {
      try {
        if (!exportedUserIds || exportedUserIds.length === 0) {
          return;
        }

        // Check which users have card print requests
        const checkResult = await this.electronAPI.checkCardPrintRequests(exportedUserIds);

        if (!checkResult.success) {
          console.error('Error checking card print requests:', checkResult.error);
          return;
        }

        const usersWithRequests = checkResult.usersWithRequests || [];

        if (usersWithRequests.length === 0) {
          // No users with pending card print requests
          return;
        }

        // Ask user if they want to mark cards as printed
        const shouldMarkAsPrinted = await this.confirmModal.show(
          `${usersWithRequests.length} de los usuarios exportados tienen solicitud de carnet pendiente.\n\n¿Desea marcarlos como impresos?`
        );

        if (shouldMarkAsPrinted) {
          // Mark cards as printed (move from To-Print-ID to Printed-ID)
          const markResult = await this.electronAPI.markCardsAsPrinted(usersWithRequests);

          if (markResult.success) {
            this.showInfoModal(
              'Carnets marcados como impresos',
              `Se han movido ${markResult.movedCount} solicitud(es) de carnet a la carpeta 'Printed-ID'`
            );

            // Trigger a refresh of the user list to update indicators
            if (this.onExportComplete) {
              this.onExportComplete();
            }
          } else {
            this.showInfoModal('Error', 'Error al marcar carnets como impresos: ' + markResult.error);
          }
        }
      } catch (error) {
        console.error('Error in checkAndMarkCardsAsPrinted:', error);
      }
    }

    /**
     * Export inventory CSV files (3 files: Alumnado, Personal, Grupos)
     */
    async exportInventoryCSV() {
      if (!this.checkProjectOpen()) return;

      // Get current group information
      const { selectedGroupCode, selectedGroupName } = await this.getSelectedGroupInfo();

      // Show inventory export options modal
      const options = await this.inventoryExportOptionsModal.show({
        selectedGroupCode,
        selectedGroupName
      });

      // User cancelled
      if (!options) return;

      // Determine which users to export
      let usersToExport;
      if (options.scope === 'all') {
        // Export all users - no filters
        const result = await this.electronAPI.getUsers({}, {});
        if (result.success) {
          usersToExport = result.users;
        } else {
          this.showInfoModal('Error', 'Error al cargar los usuarios');
          return;
        }
      } else {
        // Export selected group only
        const result = await this.electronAPI.getUsers({ group: selectedGroupCode }, {});
        if (result.success) {
          usersToExport = result.users;
        } else {
          this.showInfoModal('Error', 'Error al cargar los usuarios del grupo');
          return;
        }
      }

      const emptyMessage = options.scope === 'all'
        ? 'El proyecto no tiene usuarios que exportar.'
        : 'El grupo seleccionado no tiene usuarios que exportar.';
      if (!(await this.ensureUsersToExport(usersToExport, emptyMessage))) return;

      // Show folder picker
      const dialogResult = await this.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta para guardar los CSV de inventario'
      });

      if (!dialogResult.canceled && dialogResult.filePaths.length > 0) {
        const folderPath = dialogResult.filePaths[0];

        // Export CSV files
        const exportResult = await this.electronAPI.exportInventoryCSV(folderPath, usersToExport);

        if (exportResult.success) {
          const results = exportResult.results;
          let message = `CSV de inventario exportados correctamente\n\n`;
          message += `${results.filesCreated} archivos creados\n\n`;

          if (results.files.length > 0) {
            message += 'Archivos generados:\n';
            results.files.forEach(file => {
              message += `  • ${file.filename} (${file.userCount} registros)\n`;
            });
          }

          // Export images if enabled
          if (options.exportImages) {
            message += '\n' + await this.exportInventoryPhotos(folderPath, usersToExport, options);
          }

          this.showInfoModal('Exportación exitosa', message);
        } else {
          this.showInfoModal('Error', 'Error al exportar los CSV de inventario: ' + exportResult.error);
        }
      }
    }

    /**
     * The repository photos of an inventory export, named by NIA or document
     *
     * Shared by the Edu Inventory Manager and Inventario Legacy exports.
     *
     * @param {string} folderPath
     * @param {Array<Object>} users
     * @param {Object} options - as InventoryExportOptionsModal returns them
     * @returns {Promise<string>} the lines that go in the final summary
     */
    async exportInventoryPhotos(folderPath, users, options) {
      // Convert modal format to API format
      const imageOptions = {
        copyOriginal: options.imageOptions.copyOriginal,
        resizeEnabled: options.imageOptions.resizeEnabled,
        boxSize: options.imageOptions.boxSize,
        maxSizeKB: options.imageOptions.maxSizeKB,
        zipEnabled: options.zipEnabled || false,
        zipMaxSizeMB: options.zipMaxSizeMB || 25
      };

      // Show progress
      this.showProgressModal('Exportando Imágenes', 'Procesando archivos...');

      // Perform image export
      const imageExportResult = await this.electronAPI.exportInventoryImages(folderPath, users, imageOptions);

      // Wait a moment to show 100% progress
      await new Promise(resolve => setTimeout(resolve, 500));
      this.closeProgressModal();

      if (!imageExportResult.success) {
        return `\nError al exportar imágenes: ${imageExportResult.error}`;
      }

      const imageResults = imageExportResult.results;
      let message = `\nImágenes exportadas:\n`;
      message += `  • Total procesadas: ${imageResults.total}\n`;
      message += `  • Exportadas correctamente: ${imageResults.exported}\n`;
      message += `  • Sin imagen en depósito: ${imageResults.skipped}\n`;

      if (imageResults.errors > 0) {
        message += `  • Errores: ${imageResults.errors}\n`;
      }

      // Add ZIP file information if applicable
      if (imageOptions.zipEnabled && imageResults.zipFiles && imageResults.zipFiles.length > 0) {
        message += `\nArchivos ZIP creados:\n`;
        imageResults.zipFiles.forEach(zipFile => {
          message += `  • ${zipFile.name} (${zipFile.count} imágenes)\n`;
        });
      }
      return message;
    }

    /**
     * The selected group's code and name, for the inventory dialogs
     * @returns {Promise<{selectedGroupCode: string|null, selectedGroupName: string|null}>}
     */
    async getSelectedGroupInfo() {
      const selectedGroupCode = this.getCurrentFilters().group || null;
      let selectedGroupName = null;
      if (selectedGroupCode) {
        try {
          const groupsResult = await this.electronAPI.getGroups();
          if (groupsResult.success) {
            const group = groupsResult.groups.find(g => g.code === selectedGroupCode);
            if (group) {
              selectedGroupName = group.name;
            }
          }
        } catch (error) {
          console.error('Error getting group info:', error);
        }
      }
      return { selectedGroupCode, selectedGroupName };
    }

    /**
     * Files for Inventario Legacy: Grupos.csv, Matrícula.csv, Personal.csv
     * and, if asked for, the repository photos in ZIP files
     *
     * The main process reads the users itself, with data from the project's
     * XML, and answers with the ones exported: students who have left are
     * not, and their photos must not go either.
     */
    async exportLegacyInventory() {
      if (!this.checkProjectOpen()) return;

      const { selectedGroupCode, selectedGroupName } = await this.getSelectedGroupInfo();
      const options = await this.inventoryExportOptionsModal.show({
        selectedGroupCode,
        selectedGroupName,
        title: 'Archivos para Inventario Legacy',
        requireZip: true
      });
      if (!options) return;

      const dialogResult = await this.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta para guardar los archivos de Inventario Legacy'
      });
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) return;
      const folderPath = dialogResult.filePaths[0];

      const exportResult = await this.electronAPI.exportLegacyInventoryCSV(folderPath, {
        groupCode: options.scope === 'group' ? selectedGroupCode : null
      });
      if (!exportResult.success) {
        this.showInfoModal('Error', 'Error al exportar los archivos de Inventario Legacy: ' + exportResult.error);
        return;
      }

      const { files, leftOut } = exportResult.results;
      let message = 'Archivos de Inventario Legacy exportados correctamente\n\n';
      files.forEach(file => {
        message += `  • ${file.fileName} (${file.rows} registros)\n`;
      });
      if (leftOut > 0) {
        message += leftOut === 1
          ? '\n1 alumno de baja no se ha exportado.\n'
          : `\n${leftOut} alumnos de baja no se han exportado.\n`;
      }

      if (options.exportImages && exportResult.users.length > 0) {
        message += '\n' + await this.exportInventoryPhotos(folderPath, exportResult.users, options);
      }

      this.showInfoModal('Exportación exitosa', message);
    }

    /**
     * Export images by ID
     */
    async exportImagesByID() {
      if (!this.checkProjectOpen()) return;

      // Who this export covers, asked when the answer is not obvious
      const scope = await this.chooseExportScope();
      if (!scope) return;
      const usersToExport = scope.users;

      // Show folder picker
      const result = await this.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta para exportar las imágenes'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = result.filePaths[0];

        // Show export options modal and wait for user choice
        const options = await this.exportOptionsModal.show(
          this.describeExportScope(usersToExport, 'a la carpeta', { scopeLabel: scope.label }).rows
        );

        if (!options) {
          // User cancelled
          return;
        }

        // Convert modal format to API format
        const apiOptions = this.convertOptionsToAPI(options);

        // Show progress
        this.showProgressModal('Exportando Imágenes', 'Procesando archivos...');

        // Perform export
        const exportResult = await this.electronAPI.exportImages(folderPath, usersToExport, apiOptions);

        // Wait a moment to show 100% progress
        await new Promise(resolve => setTimeout(resolve, 500));
        this.closeProgressModal();

        if (!exportResult.success) {
          this.showInfoModal('Error', 'Error al exportar imágenes: ' + exportResult.error);
        } else if (exportResult.results) {
          // Users with no group or a missing photo used to be left out silently
          await this.showInfoModal('Exportación completada', this.summarizeImagesExport(exportResult.results));
        }
      }
    }

    /**
     * Export repository images named by ID
     *
     * Like exportImagesByID, but each user's photo comes from the repository.
     * How many have one is asked to the main process, which reads the
     * repository itself: what the list knows depends on the Ver options.
     */
    async exportRepositoryImagesByID() {
      if (!this.checkProjectOpen()) return;

      const scope = await this.chooseExportScope();
      if (!scope) return;
      const usersToExport = scope.users;

      const count = await this.electronAPI.countRepositoryImages(usersToExport);

      if (!count || !count.success) {
        await this.showInfoModal('Error', (count && count.error) || 'No se pudo consultar el depósito de imágenes.');
        return;
      }

      if (count.withPhoto === 0) {
        await this.showInfoModal(
          'Aviso',
          `Ninguno de los ${usersToExport.length} usuarios a exportar tiene foto en el depósito.`
        );
        return;
      }

      const result = await this.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta para exportar las imágenes del depósito'
      });

      if (result.canceled || result.filePaths.length === 0) return;

      const folderPath = result.filePaths[0];

      const options = await this.exportOptionsModal.show([
        { label: 'Se exportará', value: scope.label },
        { label: 'Imágenes del depósito a exportar', value: String(count.withPhoto) },
        { label: 'Usuarios sin foto en el depósito', value: String(count.withoutPhoto) }
      ]);

      if (!options) return;

      const apiOptions = this.convertOptionsToAPI(options);

      this.showProgressModal('Exportando Imágenes del Depósito', 'Procesando archivos...');

      const exportResult = await this.electronAPI.exportRepositoryImages(folderPath, usersToExport, apiOptions);

      // Wait a moment to show 100% progress
      await new Promise(resolve => setTimeout(resolve, 500));
      this.closeProgressModal();

      if (!exportResult.success) {
        await this.showInfoModal('Error', 'Error al exportar imágenes del depósito: ' + exportResult.error);
        return;
      }

      await this.showInfoModal('Exportación completada', this.summarizeImagesExport(exportResult.results));
    }

    /**
     * What an image export did, for the message shown when it finishes
     * @param {Object} results - exported, groupsFolders, withoutRepositoryImage, withoutGroup, errors
     * @returns {string}
     */
    summarizeImagesExport(results) {
      const lines = [
        `Se han exportado ${results.exported} ${results.exported === 1 ? 'imagen' : 'imágenes'} `
          + `en ${results.groupsFolders} ${results.groupsFolders === 1 ? 'carpeta' : 'carpetas'} de grupo.`
      ];

      if (results.withoutRepositoryImage > 0) {
        lines.push(results.withoutRepositoryImage === 1
          ? '1 usuario no tiene foto en el depósito.'
          : `${results.withoutRepositoryImage} usuarios no tienen foto en el depósito.`);
      }

      if (results.withoutGroup > 0) {
        lines.push(results.withoutGroup === 1
          ? '1 usuario sin grupo no se ha exportado.'
          : `${results.withoutGroup} usuarios sin grupo no se han exportado.`);
      }

      const errors = results.errors || [];
      if (errors.length > 0) {
        const shown = errors.slice(0, 5).map(error => `- ${error.user}: ${error.error}`);
        lines.push('', `No se ${errors.length === 1 ? 'pudo exportar 1 imagen' : `pudieron exportar ${errors.length} imágenes`}:`, ...shown);
        if (errors.length > shown.length) {
          lines.push(`... y ${errors.length - shown.length} más (detalle en el registro del proyecto).`);
        }
      }

      return lines.join('\n');
    }

    /**
     * Export images by name
     */
    async exportImagesByName() {
      if (!this.checkProjectOpen()) return;

      // Who this export covers, asked when the answer is not obvious
      const scope = await this.chooseExportScope();
      if (!scope) return;
      const usersToExport = scope.users;

      // Show folder picker
      const result = await this.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta para exportar las imágenes'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = result.filePaths[0];

        // Show export options modal and wait for user choice
        const options = await this.exportOptionsModal.show(
          this.describeExportScope(usersToExport, 'a la carpeta', { scopeLabel: scope.label }).rows
        );

        if (!options) {
          // User cancelled
          return;
        }

        // Convert modal format to API format
        const apiOptions = this.convertOptionsToAPI(options);

        // Show progress
        this.showProgressModal('Exportando Imágenes', 'Procesando archivos...');

        // Perform export
        const exportResult = await this.electronAPI.exportImagesName(folderPath, usersToExport, apiOptions);

        // Wait a moment to show 100% progress
        await new Promise(resolve => setTimeout(resolve, 500));
        this.closeProgressModal();

        if (!exportResult.success) {
          this.showInfoModal('Error', 'Error al exportar imágenes: ' + exportResult.error);
        } else if (exportResult.results) {
          // Users with no group or a missing photo used to be left out silently
          await this.showInfoModal('Exportación completada', this.summarizeImagesExport(exportResult.results));
        }
      }
    }

    /**
     * Which users an export will take, in words
     *
     * @returns {string}
     */
    describeScopeLabel(chosenLabel = null) {
      if (chosenLabel) {
        return chosenLabel;
      }

      const selectionMode = this.getSelectionMode();
      const selectedUsers = this.getSelectedUsers();

      if (selectionMode && selectedUsers && selectedUsers.size > 0) {
        return `${selectedUsers.size} usuarios seleccionados`;
      }

      return this.describeListLabel();
    }

    /**
     * What left these users on the list, in words
     *
     * The selection is not part of it: it is a scope of its own, and naming it
     * here would make the list scope describe a different set of people.
     *
     * @returns {string}
     */
    describeListLabel() {
      const searchTerm = this.getSearchTerm();

      if (this.getShowDuplicatesOnly()) {
        return 'Usuarios con asignaciones duplicadas';
      }
      if (this.getShowCardPrintRequestsOnly()) {
        return 'Usuarios con carnet solicitado';
      }
      if (this.getShowPublicationRequestsOnly()) {
        return 'Usuarios con publicación solicitada';
      }
      if (searchTerm) {
        // A search ignores the group filter, so naming the group here would lie
        return `Búsqueda "${searchTerm}", en todos los grupos`;
      }
      return this.getGroupFilterLabel() || 'Todos los grupos';
    }

    /**
     * Describe what an export is about to cover
     *
     * getUsersToExport() silently follows the selection, the filters of the Ver
     * menu, the search box or the group filter, in that order. Which one
     * applied is not obvious from the screen, so it is spelled out before
     * confirming.
     *
     * @param {Array} usersToExport
     * @param {string} destination - Where the images are going, for the wording
     * @param {Object} [options]
     * @param {{withPhoto: number, withoutPhoto: number}} [options.repositoryCount] -
     *   How many of the images to send already have a photo in the repository,
     *   read from the repository itself (count-repository-images). Given, the
     *   images are broken down into replacements and new ones
     * @returns {{rows: Array<{label: string, value: string}>, note: string|null}}
     */
    describeExportScope(usersToExport, destination, options = {}) {
      const scope = this.describeScopeLabel(options.scopeLabel);

      const withImage = usersToExport.filter(user => user.image_path);

      const rows = [
        { label: 'Se exportará', value: scope },
        { label: `Imágenes a enviar ${destination}`, value: String(withImage.length) },
        { label: 'Usuarios sin foto capturada', value: String(usersToExport.length - withImage.length) }
      ];

      // Not what the list knows: that depends on the Ver repository options,
      // and with them off it reported zero replacements
      const count = options.repositoryCount;
      if (!count) {
        return { rows, note: null };
      }

      rows.push({ label: 'Reemplazarán una foto existente', value: String(count.withPhoto) });
      rows.push({ label: 'Son fotos nuevas en el depósito', value: String(count.withoutPhoto) });

      return {
        rows,
        note: 'Las cifras del depósito son las de este momento, así que pueden variar si '
          + 'otro equipo exporta a la vez. Las fotos que se reemplacen no se pierden: se '
          + 'guardan en la carpeta "Reemplazadas" del depósito.'
      };
    }

    /**
     * Export images to repository (Google Drive)
     */
    async exportToRepository() {
      if (!this.checkProjectOpen()) return;

      // Who this export covers, asked when the answer is not obvious
      const scope = await this.chooseExportScope();
      if (!scope) return;
      const usersToExport = scope.users;

      // What the repository holds for the photos about to be sent, read from
      // the repository rather than from what the list happens to know
      const withImage = usersToExport.filter(user => user.image_path);
      let repositoryCount = null;
      if (withImage.length > 0) {
        const count = await this.electronAPI.countRepositoryImages(withImage);
        if (!count || !count.success) {
          await this.showInfoModal('Error', (count && count.error) || 'No se pudo consultar el depósito de imágenes.');
          return;
        }
        repositoryCount = { withPhoto: count.withPhoto, withoutPhoto: count.withoutPhoto };
      }

      // Show export options modal and wait for user choice
      const summary = this.describeExportScope(usersToExport, 'al depósito', {
        repositoryCount,
        scopeLabel: scope.label
      });
      const savedRequests = await this.loadRepositoryExportRequests();
      const options = await this.exportOptionsModal.show(summary.rows, summary.note, {
        requests: savedRequests
      });

      if (!options) {
        // User cancelled
        return;
      }

      const requests = options.requests || { cards: false, publications: false };
      await this.saveRepositoryExportRequests(savedRequests, requests);

      // Convert modal format to API format
      const apiOptions = this.convertOptionsToAPI(options);

      // Show progress
      this.showProgressModal('Exportando al Depósito', 'Procesando archivos...');

      // Perform export
      const exportResult = await this.electronAPI.exportToRepository(usersToExport, apiOptions);

      // Wait a moment to show 100% progress
      await new Promise(resolve => setTimeout(resolve, 500));
      this.closeProgressModal();

      if (exportResult.success) {
        const results = exportResult.results;
        let message = `Exportación completada:\n\n`;
        message += `Total de usuarios con imágenes: ${results.total}\n`;
        message += `Imágenes exportadas correctamente: ${results.exported}\n`;

        // Otherwise nobody would know the replaced photos were kept
        if (results.replaced > 0) {
          message += `\nSe han sustituido ${results.replaced} fotos que ya estaban en el depósito.\n`;
          message += `Las anteriores se conservan en la carpeta "Reemplazadas" del depósito.\n`;
        }

        // Filed after the copy, so the publication takes the new photo
        const requestLines = await this.fileRepositoryExportRequests(requests, results.exportedUserIds || []);
        if (requestLines.length > 0) {
          message += `\n${requestLines.join('\n')}\n`;
        }

        if (results.errors.length > 0) {
          message += `\nErrores (${results.errors.length}):\n`;
          message += results.errors.slice(0, 5).map(e => `${e.user}: ${e.error}`).join('\n');
          if (results.errors.length > 5) {
            message += `\n... y ${results.errors.length - 5} más`;
          }
        }

        // Show export result first
        await this.showInfoModal('Exportación completada', message);

        // Offer to unlink what was exported, and only that: clearing the whole
        // project would also drop the links of users left out by the current
        // filter, whose photos never reached the repository
        if (results.exported > 0) {
          const exportedUserIds = results.exportedUserIds || [];
          const count = exportedUserIds.length || results.exported;

          const shouldClear = await this.confirmModal.show(
            `Sus fotos ya están en el depósito. ¿Deseas desvincularlas de los ${count} ` +
            'usuarios exportados?\n\n' +
            'Sus fichas quedarán sin foto capturada, listas para una nueva ronda. No se ' +
            'borra ninguna imagen: las fotos siguen en la carpeta del proyecto y en el ' +
            'depósito.\n\n' +
            'Antes se guardará una copia de seguridad de los enlaces, que puedes ' +
            'restaurar desde Proyecto > Restaurar enlaces de imágenes.'
          );

          if (shouldClear) {
            await this.clearCapturedImagesWithBackup(exportedUserIds);
          }
        }

        // Notify completion (for reloading users, etc.)
        this.onExportComplete();
      } else {
        this.showInfoModal('Error', 'Error al exportar imágenes: ' + exportResult.error);
      }
    }

    /**
     * Whether this project files requests when exporting to the repository
     *
     * Read on each export, so a change made from another window applies. If it
     * cannot be read, both start unticked, as in a project that never set it.
     *
     * @returns {Promise<{cards: boolean, publications: boolean}>}
     */
    async loadRepositoryExportRequests() {
      const none = { cards: false, publications: false };
      if (!this.electronAPI.getRepositoryExportRequests) return none;

      try {
        const result = await this.electronAPI.getRepositoryExportRequests();
        return result && result.success && result.requests ? result.requests : none;
      } catch (error) {
        console.error('Error reading the repository export requests:', error);
        return none;
      }
    }

    /**
     * Remember the ticks for the next export, when they changed
     * @param {{cards: boolean, publications: boolean}} saved
     * @param {{cards: boolean, publications: boolean}} chosen
     */
    async saveRepositoryExportRequests(saved, chosen) {
      if (!this.electronAPI.setRepositoryExportRequests) return;
      if (saved.cards === chosen.cards && saved.publications === chosen.publications) return;

      try {
        await this.electronAPI.setRepositoryExportRequests(chosen);
      } catch (error) {
        // Not worth stopping the export: the ticks just come back as they were
        console.error('Error saving the repository export requests:', error);
      }
    }

    /**
     * Request the cards and the publication of the users just exported
     *
     * Only those whose photo reached the repository: for the rest the
     * repository still holds the old photo, or none.
     *
     * @param {{cards: boolean, publications: boolean}} requests
     * @param {number[]} exportedUserIds
     * @returns {Promise<string[]>} Lines for the result message
     */
    async fileRepositoryExportRequests(requests, exportedUserIds) {
      const lines = [];
      if (exportedUserIds.length === 0) return lines;

      const file = async (call, done, what) => {
        try {
          const result = await call(exportedUserIds);
          if (result && result.success) {
            let line = done(result.count);
            if (result.skipped > 0) {
              line += ` ${result.skipped} omitidos por no tener foto en el depósito.`;
            }
            lines.push(line);
          } else {
            lines.push(`No se ha podido solicitar ${what}: ${(result && result.error) || 'error desconocido'}`);
          }
        } catch (error) {
          lines.push(`No se ha podido solicitar ${what}: ${error.message}`);
        }
      };

      if (requests.cards) {
        await file(ids => this.electronAPI.requestCardPrint(ids),
          count => `Se ha solicitado la impresión de ${count} carnets.`,
          'la impresión de los carnets');
      }

      if (requests.publications) {
        await file(ids => this.electronAPI.requestPublication(ids),
          count => `Se ha solicitado la publicación oficial de ${count} fotos.`,
          'la publicación oficial');
      }

      return lines;
    }

    /**
     * Clear captured images with automatic backup
     *
     * The backup deliberately covers every link in the project, not just the
     * ones about to be cleared: restoring it puts the project back exactly as
     * it was, which is the point of the safety net.
     *
     * @param {number[]} [userIds] - Users to unlink. Omit to clear them all.
     */
    async clearCapturedImagesWithBackup(userIds) {
      try {
        // Show progress
        this.showProgressModal('Desvinculando fotos', 'Creando copia de seguridad...');

        // Create backup first
        const backupResult = await this.electronAPI.backupImageRelationships();

        if (!backupResult.success) {
          this.closeProgressModal();
          this.showInfoModal('Error', 'Error al crear copia de seguridad: ' + backupResult.error);
          return;
        }

        // Clear captured images
        const clearResult = await this.electronAPI.clearCapturedImages(userIds);

        this.closeProgressModal();

        if (clearResult.success) {
          await this.showInfoModal(
            'Fotos desvinculadas',
            `Se han desvinculado ${clearResult.cleared} fotos. Los archivos no se han borrado.\n\n` +
            `Copia de seguridad con ${backupResult.count} enlaces de todo el proyecto.\n` +
            `Fecha: ${new Date(backupResult.backupDate).toLocaleString('es-ES')}\n\n` +
            'Puedes deshacerlo desde Proyecto > Restaurar enlaces de imágenes.'
          );

          // Notify completion to reload users
          this.onExportComplete();
        } else {
          await this.showInfoModal('Error', 'Error al limpiar enlaces: ' + clearResult.error);
        }
      } catch (error) {
        this.closeProgressModal();
        await this.showInfoModal('Error', 'Error inesperado: ' + error.message);
      }
    }

    /**
     * PDF with the users of the chosen scope who have no photo, a page per
     * group so each one can be handed to its tutor
     * @param {'captured'|'repository'} source - no captured photo linked, or
     *   no photo in the repository
     */
    async exportMissingPhotosPDF(source) {
      if (!this.checkProjectOpen()) return;

      const scope = await this.chooseExportScope();
      if (!scope) return;
      const users = scope.users;
      const noun = source === 'repository' ? 'foto en el depósito' : 'foto capturada';

      // Checked before the folder is asked for, so a list with nobody on it
      // or an unreachable repository do not cost a trip through the dialog
      let missing;
      if (source === 'repository') {
        const count = await this.electronAPI.countRepositoryImages(users);
        if (!count || !count.success) {
          await this.showInfoModal('Error', (count && count.error) || 'No se pudo consultar el depósito de imágenes.');
          return;
        }
        missing = count.withoutPhoto;
      } else {
        missing = users.filter((user) => !user.image_path).length;
      }

      if (missing === 0) {
        await this.showInfoModal('Aviso', `No hay usuarios sin ${noun} (${scope.label}).`);
        return;
      }

      const result = await this.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Seleccionar carpeta para guardar el listado',
        buttonLabel: 'Exportar'
      });
      if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) return;

      this.showProgressModal('Exportando listado en PDF', 'Generando el listado...');
      const exportResult = await this.electronAPI.exportMissingPhotosPDF({
        exportPath: result.filePaths[0],
        users,
        source,
        scopeLabel: scope.label
      });
      this.closeProgressModal();

      if (!exportResult || !exportResult.success) {
        await this.showInfoModal('Error', 'Error al exportar el listado: ' + ((exportResult && exportResult.error) || 'error desconocido'));
        return;
      }

      if (!exportResult.fileName) {
        await this.showInfoModal('Aviso', `No hay usuarios sin ${noun} (${scope.label}).`);
        return;
      }

      await this.showInfoModal(
        'Exportación completada',
        `Se ha generado ${exportResult.fileName} con ${exportResult.missing} de ${exportResult.total} usuarios sin ${noun}, ` +
        `en ${exportResult.groups} ${exportResult.groups === 1 ? 'grupo' : 'grupos'}.`
      );
    }

    /**
     * PDF with the photos by group statistics, captured and in the
     * repository, for the whole project like the window it copies
     */
    async exportGroupCoveragePDF() {
      if (!this.checkProjectOpen()) return;

      const result = await this.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Seleccionar carpeta para guardar las estadísticas',
        buttonLabel: 'Exportar'
      });
      if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) return;

      this.showProgressModal('Exportando estadísticas en PDF', 'Contando las fotografías de cada grupo...');
      const exportResult = await this.electronAPI.exportGroupCoveragePDF({ exportPath: result.filePaths[0] });
      this.closeProgressModal();

      if (!exportResult || !exportResult.success) {
        await this.showInfoModal('Error', 'Error al exportar las estadísticas: ' + ((exportResult && exportResult.error) || 'error desconocido'));
        return;
      }

      const lines = [`Se ha generado ${exportResult.fileName}.`];
      if (!exportResult.includesRepository) {
        lines.push('', `No incluye el depósito: ${exportResult.repositoryNote}`);
      }
      await this.showInfoModal('Exportación completada', lines.join('\n'));
    }

    /**
     * Convert modal options format to API format
     * @param {object} options - Options from ExportOptionsModal
     * @returns {object} Options in API format
     */
    convertOptionsToAPI(options) {
      return {
        copyOriginal: options.mode === 'copy',
        resizeEnabled: options.mode === 'resize',
        boxSize: options.resize ? options.resize.boxSize : null,
        maxSizeKB: options.resize ? options.resize.maxSize : null
      };
    }
  }

  // Export (for tests and browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ExportManager };
  } else if (typeof window !== 'undefined') {
    global.ExportManager = ExportManager;
  }
})(typeof window !== 'undefined' ? window : global);
