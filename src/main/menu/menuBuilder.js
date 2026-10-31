// @ts-check
const { Menu, dialog } = require('electron');
const { showAppMessage } = require('../appDialogs');
const path = require('path');

/**
 * MenuBuilder - Responsible for creating and managing the application menu
 */
class MenuBuilder {
  constructor(context) {
    // Windows
    this.mainWindow = context.mainWindow;

    // State
    this.cameraEnabled = context.cameraEnabled;
    this.cameraAutoStart = context.cameraAutoStart;
    this.selectedCameraId = context.selectedCameraId;
    this.availableCameras = context.availableCameras;
    this.showDuplicatesOnly = context.showDuplicatesOnly;
    this.showCardPrintRequestsOnly = context.showCardPrintRequestsOnly;
    this.showPublicationRequestsOnly = context.showPublicationRequestsOnly;
    this.showCapturedPhotos = context.showCapturedPhotos;
    this.showRepositoryPhotos = context.showRepositoryPhotos;
    this.showRepositoryIndicators = context.showRepositoryIndicators;
    this.showAdditionalActions = context.showAdditionalActions;
    // Preferencias > Orla de graduación; off, there is no Orla menu
    this.orlaEnabled = context.orlaEnabled !== false;
    this.showCaptureHistory = context.showCaptureHistory;
    this.sortByLinkDate = context.sortByLinkDate;
    this.showThumbnailGrid = context.showThumbnailGrid;
    this.recentProjects = context.recentProjects;
    // null without a project, when the choice is not available
    this.incomingRotation = context.incomingRotation ?? null;
    this.workspaces = context.workspaces || [];
    this.activeWorkspaceId = context.activeWorkspaceId || null;

    // Functions/callbacks
    this.callbacks = context.callbacks;

    // Logger
    this.logger = context.logger;
  }

  /**
   * Build and set the application menu
   */
  build() {
    /** @type {Array<Electron.MenuItemConstructorOptions>} */
    const template = [
      this.buildFileMenu(),
      this.buildEditMenu(),
      this.buildProjectMenu(),
      this.buildCameraMenu(),
      this.buildViewMenu(),
      ...(this.orlaEnabled ? [this.buildOrlaMenu()] : []),
      this.buildHelpMenu()
    ];

    // Add Developer menu in development mode
    if (process.argv.includes('--dev')) {
      template.push(this.buildDeveloperMenu());
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    // On Windows that puts the menu on every window, including those meant
    // to have none
    this.callbacks?.onApplicationMenuSet?.();
  }

  /**
   * Build File menu
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildFileMenu() {
    // Build recent projects submenu
    const recentProjectsSubmenu = this.recentProjects.length > 0
      ? this.recentProjects.map((projectPath, index) => ({
          label: path.basename(projectPath),
          accelerator: index < 9 ? `CmdOrCtrl+${index + 1}` : undefined,
          click: () => {
            this.callbacks.openRecentProject(projectPath);
          }
        }))
      : [{ label: 'No hay proyectos recientes', enabled: false }];

    return {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo Proyecto...',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            this.mainWindow.webContents.send('menu-new-project');
          }
        },
        {
          label: 'Abrir Proyecto...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            this.mainWindow.webContents.send('menu-open-project');
          }
        },
        {
          label: 'Cerrar Proyecto',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            this.mainWindow.webContents.send('menu-close-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Proyectos Recientes',
          submenu: recentProjectsSubmenu
        },
        { type: 'separator' },
        {
          label: 'Importar',
          submenu: [
            {
              label: 'Imágenes con ID',
              click: () => {
                this.mainWindow.webContents.send('menu-import-images-id');
              }
            }
          ]
        },
        {
          label: 'Exportar',
          submenu: [
            {
              label: 'Archivo CSV para Carnets del grupo seleccionado',
              accelerator: 'CmdOrCtrl+E',
              click: () => {
                this.mainWindow.webContents.send('menu-export-csv');
              }
            },
            {
              label: 'Archivos para Edu Inventory Manager',
              click: () => {
                this.mainWindow.webContents.send('menu-export-inventory-csv');
              }
            },
            { type: 'separator' },
            {
              label: 'Imágenes capturadas como ID',
              click: () => {
                this.mainWindow.webContents.send('menu-export-images');
              }
            },
            {
              label: 'Imágenes del depósito como ID',
              click: () => {
                this.mainWindow.webContents.send('menu-export-repository-images');
              }
            },
            {
              label: 'Imágenes capturadas como nombre y apellidos',
              click: () => {
                this.mainWindow.webContents.send('menu-export-images-name');
              }
            },
            { type: 'separator' },
            {
              label: 'Imágenes capturadas al depósito',
              click: () => {
                this.mainWindow.webContents.send('menu-export-to-repository');
              }
            },
            { type: 'separator' },
            {
              label: 'Listado en PDF con fotografías por grupo',
              click: () => {
                this.mainWindow.webContents.send('menu-export-photo-roster-pdf');
              }
            },
            {
              label: 'Listado en PDF de usuarios sin foto en el depósito',
              click: () => {
                this.mainWindow.webContents.send('menu-export-missing-repository-photos-pdf');
              }
            },
            {
              label: 'Listado en PDF de usuarios sin foto capturada',
              click: () => {
                this.mainWindow.webContents.send('menu-export-missing-captured-photos-pdf');
              }
            },
            {
              label: 'Estadísticas de fotografías por grupo en PDF',
              click: () => {
                this.mainWindow.webContents.send('menu-export-group-coverage-pdf');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Preferencias...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            this.mainWindow.webContents.send('menu-preferences');
          }
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: 'CmdOrCtrl+Q',
          role: 'quit'
        }
      ]
    };
  }

  /**
   * Build Edit menu
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildEditMenu() {
    return {
      label: 'Edición',
      submenu: [
        {
          label: 'Enlazar imagen',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            this.mainWindow.webContents.send('menu-link-image');
          }
        },
        {
          label: 'Eliminar fotografía vinculada',
          accelerator: 'CmdOrCtrl+Delete',
          click: () => {
            this.mainWindow.webContents.send('menu-delete-photo');
          }
        },
        { type: 'separator' },
        {
          label: 'Agregar etiqueta a imagen',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            this.mainWindow.webContents.send('menu-add-image-tag');
          }
        }
      ]
    };
  }

  /**
   * Build Project menu
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildProjectMenu() {
    return {
      label: 'Proyecto',
      submenu: [
        {
          label: 'Información del proyecto',
          click: () => {
            this.mainWindow.webContents.send('menu-project-info');
          }
        },
        { type: 'separator' },
        {
          label: 'Actualizar archivo XML',
          click: () => {
            this.mainWindow.webContents.send('menu-update-xml');
          }
        },
        { type: 'separator' },
        {
          label: 'Configurar depósito de imágenes',
          click: async () => {
            const currentPath = await this.callbacks.getImageRepositoryPath();

            const result = await dialog.showOpenDialog(this.mainWindow, {
              title: 'Seleccionar carpeta del depósito de imágenes',
              defaultPath: currentPath || undefined,
              properties: ['openDirectory', 'createDirectory']
            });

            if (!result.canceled && result.filePaths.length > 0) {
              const selectedPath = result.filePaths[0];

              if (await this.callbacks.setImageRepositoryPath(selectedPath)) {
                // Reinitialize repository mirror with new path
                if (this.callbacks.reinitializeRepositoryMirror) {
                  await this.callbacks.reinitializeRepositoryMirror();
                }

                // Notify renderer to update status bar
                this.mainWindow.webContents.send('repository-path-changed');

                showAppMessage(this.mainWindow, {
                  title: 'Configuración guardada',
                  message: 'Depósito de imágenes configurado.',
                  detail: `Ruta: ${selectedPath}`
                });
              } else {
                showAppMessage(this.mainWindow, {
                  title: 'Error',
                  message: 'No se pudo guardar la configuración del depósito.'
                });
              }
            }
          }
        },
        {
          label: 'Configurar carpeta de entrada (ingest)...',
          click: () => {
            this.callbacks.configureIngestFolder();
          }
        },
        this.buildIncomingRotationMenu(),
        { type: 'separator' },
        {
          label: 'Revisar solicitudes pendientes...',
          click: () => {
            this.mainWindow.webContents.send('menu-review-pending-requests');
          }
        },
        {
          label: 'Purgar fotos reemplazadas...',
          click: () => {
            this.mainWindow.webContents.send('menu-purge-replaced-archive');
          }
        },
        {
          label: 'Restaurar enlaces de imágenes...',
          click: () => {
            this.mainWindow.webContents.send('menu-restore-image-links');
          }
        }
      ]
    };
  }

  /**
   * Build Camera menu
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildCameraMenu() {
    // Build camera selection submenu
    const cameraSelectionSubmenu = this.availableCameras.length > 0
      ? this.availableCameras.map(camera => ({
          label: camera.label,
          type: 'radio',
          checked: camera.deviceId === this.selectedCameraId,
          click: () => {
            this.callbacks.selectCamera(camera.deviceId);
          }
        }))
      : [{ label: 'No hay cámaras disponibles', enabled: false }];

    return {
      label: 'Cámara',
      submenu: [
        {
          label: this.cameraEnabled ? 'Desactivar cámara' : 'Activar cámara',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            this.callbacks.toggleCamera();
          }
        },
        {
          label: 'Mostrar ventana de cámara',
          accelerator: 'CmdOrCtrl+Shift+V',
          enabled: this.cameraEnabled,
          // Shows the window or opens it again; a window kept from when the
          // menu was built may be gone
          click: () => {
            this.callbacks.openCameraWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Seleccionar cámara',
          submenu: cameraSelectionSubmenu
        },
        { type: 'separator' },
        {
          label: 'Activar la cámara al iniciar',
          type: 'checkbox',
          checked: this.cameraAutoStart,
          click: (menuItem) => {
            this.callbacks.setCameraAutoStart(menuItem.checked);
          }
        }
      ]
    };
  }

  /**
   * Proyecto > Girar las fotos entrantes: for a camera that does not record
   * how it was held. Only with a project open, since it is kept in it.
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildIncomingRotationMenu() {
    /** @type {Array<[number, string]>} */
    const choices = [
      [0, 'No girarlas'],
      [90, '90° a la derecha'],
      [180, '180°'],
      [270, '90° a la izquierda']
    ];
    const enabled = this.incomingRotation !== null;
    return {
      label: 'Girar las fotos entrantes',
      enabled,
      submenu: choices.map(([degrees, label]) => ({
        label,
        type: 'radio',
        enabled,
        checked: (this.incomingRotation || 0) === degrees,
        click: () => {
          this.callbacks.setIncomingRotation(degrees);
        }
      }))
    };
  }

  /**
   * Ver > Espacios de trabajo: one entry per workspace, the first nine with
   * Ctrl+1…9, and the one the view matches marked
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildWorkspacesMenu() {
    const entries = this.workspaces.map((workspace, index) => ({
      // '&' marks the access key in a Windows menu label; '&&' is a literal one
      label: workspace.name.replace(/&/g, '&&'),
      type: 'checkbox',
      checked: workspace.id === this.activeWorkspaceId,
      accelerator: index < 9 ? `CmdOrCtrl+${index + 1}` : undefined,
      click: () => {
        this.callbacks.applyWorkspace(workspace.id);
      }
    }));

    return {
      label: 'Espacios de trabajo',
      submenu: [
        ...entries,
        ...(entries.length > 0 ? [{ type: 'separator' }] : []),
        {
          label: 'Guardar la vista actual como espacio nuevo...',
          click: () => {
            this.callbacks.openWorkspaces('save');
          }
        },
        {
          label: 'Gestionar espacios de trabajo...',
          click: () => {
            this.callbacks.openWorkspaces('manage');
          }
        }
      ]
    };
  }

  /**
   * Build View menu
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildViewMenu() {
    return {
      label: 'Ver',
      submenu: [
        this.buildWorkspacesMenu(),
        { type: 'separator' },
        {
          label: 'Asignaciones duplicadas',
          type: 'checkbox',
          checked: this.showDuplicatesOnly,
          click: (menuItem) => {
            this.callbacks.toggleDuplicates(menuItem.checked);
          }
        },
        {
          label: 'Carnets solicitados',
          type: 'checkbox',
          checked: this.showCardPrintRequestsOnly,
          click: (menuItem) => {
            this.callbacks.toggleCardPrintRequests(menuItem.checked);
          }
        },
        {
          label: 'Publicaciones solicitadas',
          type: 'checkbox',
          checked: this.showPublicationRequestsOnly,
          click: (menuItem) => {
            this.callbacks.togglePublicationRequests(menuItem.checked);
          }
        },
        {
          label: 'Ordenar por fecha de enlace',
          type: 'checkbox',
          checked: this.sortByLinkDate,
          click: (menuItem) => {
            this.callbacks.toggleSortByLinkDate(menuItem.checked);
          }
        },
        { type: 'separator' },
        {
          label: 'Fotografías capturadas',
          type: 'checkbox',
          checked: this.showCapturedPhotos,
          click: (menuItem) => {
            this.callbacks.toggleCapturedPhotos(menuItem.checked);
          }
        },
        {
          label: 'Fotografías del depósito',
          type: 'checkbox',
          checked: this.showRepositoryPhotos,
          click: (menuItem) => {
            this.callbacks.toggleRepositoryPhotos(menuItem.checked);
          }
        },
        {
          label: 'Indicadores de foto en el depósito',
          type: 'checkbox',
          checked: this.showRepositoryIndicators,
          click: (menuItem) => {
            this.callbacks.toggleRepositoryIndicators(menuItem.checked);
          }
        },
        { type: 'separator' },
        {
          label: 'Actualizar imágenes del depósito',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            this.callbacks.refreshRepositoryImages();
          }
        },
        { type: 'separator' },
        {
          label: 'Pagos de la orla',
          type: 'checkbox',
          // Hidden, not just unchecked, with the orla service off
          visible: this.orlaEnabled,
          checked: this.showAdditionalActions,
          click: (menuItem) => {
            this.callbacks.toggleAdditionalActions(menuItem.checked);
          }
        },
        {
          label: 'Historial de capturas',
          type: 'checkbox',
          checked: this.showCaptureHistory,
          click: (menuItem) => {
            this.callbacks.toggleCaptureHistory(menuItem.checked);
          }
        },
        {
          label: 'Vista de miniaturas',
          type: 'checkbox',
          accelerator: 'CmdOrCtrl+M',
          checked: this.showThumbnailGrid,
          click: (menuItem) => {
            this.callbacks.toggleThumbnailGrid(menuItem.checked);
          }
        },
        { type: 'separator' },
        {
          label: 'Cuadro de imágenes capturadas',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            this.callbacks.openImageGridWindow();
          }
        },
        {
          label: 'Cuadro de imágenes en depósito',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            this.callbacks.openRepositoryGridWindow();
          }
        },
        {
          label: 'Visor en ventana aparte',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            this.callbacks.openViewerMirrorWindow();
          }
        },
        {
          label: 'Listado de imágenes con etiquetas',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            this.mainWindow.webContents.send('menu-show-tagged-images');
          }
        },
        {
          label: 'Fotografías por grupo',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            this.callbacks.openGroupCoverageWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Últimos carnets impresos',
          click: () => {
            this.callbacks.openPrintedCardsWindow();
          }
        }
      ]
    };
  }

  /**
   * Build Orla menu: the graduation orla service, which people pay for. The
   * photo roster PDF under Exportar is an administrative document, not this.
   * Only with the service on (Preferencias > Orla de graduación)
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildOrlaMenu() {
    return {
      label: 'Orla',
      submenu: [
        {
          label: 'Registrar el pago del usuario seleccionado',
          click: () => {
            this.mainWindow.webContents.send('menu-orla-pay');
          }
        },
        {
          label: 'Imprimir el recibo del usuario seleccionado',
          click: () => {
            this.mainWindow.webContents.send('menu-orla-print-receipt');
          }
        },
        { type: 'separator' },
        {
          label: 'Listado de alumnos pagados en PDF',
          click: () => {
            this.mainWindow.webContents.send('menu-export-paid-orla-pdf');
          }
        },
        {
          label: 'Listado de alumnos pagados en CSV',
          click: () => {
            this.mainWindow.webContents.send('menu-export-paid-users-csv');
          }
        },
        { type: 'separator' },
        {
          label: 'Configuración de la orla...',
          click: () => {
            this.mainWindow.webContents.send('menu-orla-settings');
          }
        }
      ]
    };
  }

  /**
   * Build Help menu
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildHelpMenu() {
    return {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de Edu User Capture',
          click: () => {
            this.mainWindow.webContents.send('menu-show-about');
          }
        },
        {
          label: 'Buscar actualizaciones...',
          click: () => {
            this.mainWindow.webContents.send('menu-check-updates');
          }
        },
        { type: 'separator' },
        {
          label: 'Manual de uso',
          accelerator: 'F1',
          click: () => {
            this.callbacks.openHelpWindow();
          }
        }
      ]
    };
  }

  /**
   * Build Developer menu (only in dev mode)
   * @returns {Electron.MenuItemConstructorOptions}
   */
  buildDeveloperMenu() {
    return {
      label: 'Developers',
      submenu: [
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Forzar recarga', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Herramientas de desarrollo', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Abrir POC (Refactor Test)',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            if (this.callbacks.openPOC) {
              this.callbacks.openPOC();
            }
          }
        },
        { type: 'separator' },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Zoom normal', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' }
      ]
    };
  }
}

module.exports = MenuBuilder;