# Edu User Capture App - Contexto del Proyecto

## Descripción General

Aplicación de escritorio desarrollada con Electron para la captura de imágenes de usuarios en entornos educativos.

> Para retomar el proyecto: `/abrir-sesion` (lee este archivo, `NOTES.md` y
> `ARCHITECTURE.md`); para dejarlo, `/cerrar-sesion`. El estado del trabajo y el
> siguiente paso viven en `NOTES.md`, no aquí.

## Qué es y para quién

Aplicación de escritorio para Windows con la que el personal de un centro
educativo fotografía al alumnado y al personal (webcam o carpeta vigilada),
enlaza cada foto a su ficha importada del XML del centro y la exporta a
carnets, al depósito compartido de fotos, a listados en PDF y a otros
programas. También lleva el cobro de la orla de graduación con recibo
impreso.

Se desarrolla para el **IES La Marxadella**. La usan tres grupos, cada uno con
su propia instalación: el equipo directivo (en su estación de trabajo), el
equipo que hace las fotos cada curso y el equipo que, por su cuenta, hace las
fotos y diseña las orlas de recuerdo del alumnado.

## Alcance y escalabilidad

**Hoy es un solo centro con varias instalaciones que comparten el depósito y
se actualizan solas desde las Releases de GitHub. Cuando se valide, se intentará
que la usen otros centros.** Implica:
- Cada release llega a todos: publicar solo lo comprobado, y seguir
  `docs/ACTUALIZACIONES_Y_RELEASE_PLAN.md`.
- Los proyectos (`data/*.sqlite`, `project_settings`) y `config.json` de
  versiones anteriores deben seguir abriéndose: cambios de esquema o de claves
  siempre compatibles hacia atrás, con valor por defecto si falta la clave.
- El depósito lo comparten equipos y cursos: no borrar ni mover nada en él por
  iniciativa de la aplicación (ver solicitudes y `Reemplazadas`).
- Volumen: cientos o pocos miles de usuarios por proyecto; ya hay virtual
  scroll y cachés, no hace falta optimizar más sin un problema medido.
- Pensando en otros centros: no fijar en el código nada propio de La
  Marxadella (nombre, logotipo, rutas, grupos); eso va en la configuración o
  en el XML.

## Stack

Versiones instaladas según `package-lock.json`:
- **Electron 44.10.0**, JavaScript CommonJS sin TypeScript ni bundler
- **sqlite3 5.1.7** (base de datos del proyecto), **sharp 0.34.5** (imágenes)
- **chokidar 3.6.0** (vigilancia de carpetas), **fast-xml-parser 4.5.7** (XML)
- **pdfkit 0.17.2** (PDF), **archiver 7.0.1** (ZIP), **markdown-it 15.0.3** (manual)
- **electron-updater 6.8.11** y **electron-builder 26.18.0** (instalador NSIS
  y actualizaciones desde GitHub Releases)
- **Jest 29.7.0** con `jest-environment-jsdom` (tests)
- **commit-and-tag-version 13.3.0** (versión y CHANGELOG)
- Auxiliar de recibos en **C#**, compilado con el `csc` de .NET Framework 4.x
  que trae Windows
- En ejecución, la aplicación usa el Node que lleva Electron 44 (24.22.1,
  Chromium 152), no el del sistema
- Para desarrollar hace falta **Node ≥ 22.12**: lo exigen `electron`
  (`>= 22.12.0`) y `commit-and-tag-version` (`>= 22`) en su campo `engines`.
  En local hay 24.19.0. El README (Node 16) y el workflow de GitHub Actions
  (Node 20, desactivado) están desfasados

## Comandos

- **Arrancar**: `npm run dev` (desarrollo, compila antes el auxiliar de
  recibos si puede) o `npm start`
- **Probar**: `npm test`; `npm run test:coverage` para cobertura con umbrales
- **Lint / typecheck**: no existen todavía (ver `NOTES.md`)
- **Empaquetar**: `npm run dist:win`
- **Publicar**: `npm run release` y luego `npm run release:publish` (con
  `GH_TOKEN`); detalle en «Versionado y publicación»

## Mapa de carpetas

- `main.js` — arranque del proceso principal: crea ventanas y gestores y
  conecta menú, IPC y vigilantes
- `src/main/` — proceso principal: base de datos, depósito, vigilantes,
  exportaciones, PDF, recibos, actualizaciones
- `src/main/ipc/` — los manejadores IPC, un archivo por área
- `src/preload/` — el puente `window.electronAPI` entre procesos
- `src/renderer/` — interfaz: `renderer.js` coordina los componentes de
  `components/` y los modales de `components/modals/`
- `src/help/` — manual de uso en Markdown que se empaqueta con la aplicación
- `native/receipt-printer/` — auxiliar C# que imprime los recibos con GDI
- `scripts/` — compilación del auxiliar, notas de release y prototipos (ITACA)
- `tests/unit/` — suite de Jest, renderer (JSDOM) y proceso principal (Node)
- `docs/` — planes, guía de publicación y fallos pendientes

## Convenciones no obvias

- Código en inglés, interfaz y manual en español (tuteo)
- Nada de `dialog.showMessageBox`, `alert()` ni `confirm()`: avisos con
  `showAppMessage`/`askAppQuestion` (`appDialogs.js`) o los modales propios
- Todo diálogo marca su botón de cancelar con `data-modal-cancel`, y toda
  ventana secundaria expone `close()` y se registra en
  `secondaryWindowManagers`; los tests fallan si no
- La carpeta de entrada se pide con `getActiveIngestPath(state)`, nunca
  `path.join(projectPath, 'ingest')`
- No usar la clase CSS `visible` para estados: `utilities.css` la fuerza a
  `display: block !important`
- «Orla» es solo el servicio de pago; el PDF de fotos por grupo es
  `photoRoster`
- Toda carpeta de exportación se elige con `selectExportFolder()`
- Toda funcionalidad visible actualiza `src/help/` en el mismo commit
- Commits en conventional commits, en inglés, **sin atribución a Claude ni a
  herramientas de IA**, y preguntando antes si ejecutar los tests

## Decisiones con su porqué

- **El depósito es una carpeta, no la API de Google Drive**: funciona con
  cualquier servicio que sincronice archivos; la copia local
  (`repositoryMirror.js`) evita depender de la velocidad de la unidad
- **Los recibos se imprimen con GDI (auxiliar C#)**: Chromium rasterizaba y el
  texto salía deformado en la térmica de 203 ppp; además es más rápido
- **Las fotos se giran con la etiqueta EXIF, no los píxeles**: sin
  recompresión, los datos de imagen quedan intactos
- **Recortar sí recomprime, pero siempre desde el original**: un recorte no
  puede hacerse sin tocar los píxeles, así que el primero guarda la foto tal
  como era en `imports/Originales/` y todos los siguientes parten de ella. La
  foto pierde calidad una sola vez (JPEG al 95, 4:4:4) y se puede restaurar
- **El orden alfabético se hace en JavaScript**: el `ORDER BY` de SQLite
  compara bytes y colocaba «Álvarez» tras «Zapata»
- **Miniaturas nombradas por `sha1(ruta|tamaño)` sin fecha**: una por foto y
  tamaño; con la fecha en el nombre, cada cambio dejaba huérfanas
- **Las solicitudes de otros proyectos o cursos no se borran**: el depósito es
  compartido y otro proyecto puede necesitarlas
- **Las Releases de GitHub son el servidor de actualizaciones**; el workflow de
  CI está desactivado («SDK compilation issues») y se publica desde local
- **El instalador no está firmado**: se evaluó y se aplazó por coste; hoy no
  compensa la inversión. Windows SmartScreen avisará al instalar

## Tecnologías

- **Electron**: Framework para aplicaciones de escritorio
- **Node.js**: Runtime de JavaScript
- **electron-builder**: Empaquetado de la aplicación

## Estructura del Proyecto

```
user-capture-app/
├── src/
│   ├── main/                    # Proceso principal de Electron (Node.js)
│   │   ├── ipc/                 # Manejadores IPC organizados por funcionalidad
│   │   │   ├── exportHandlers.js       # Exportación de CSV, imágenes y PDF
│   │   │   ├── helpHandlers.js         # Manual de uso: índice, páginas y búsqueda
│   │   │   ├── miscHandlers.js         # Manejadores misceláneos (tags, diálogos, etc.)
│   │   │   ├── projectHandlers.js      # Gestión de proyectos, XML y cierre
│   │   │   ├── updateHandlers.js       # Comprobación, descarga e instalación de actualizaciones
│   │   │   ├── workspaceHandlers.js    # Espacios de trabajo (Ver > Espacios de trabajo)
│   │   │   └── userGroupImageHandlers.js # Usuarios, grupos e imágenes
│   │   ├── menu/                # Sistema de menús
│   │   │   └── menuBuilder.js          # Constructor de menús de la aplicación
│   │   ├── utils/               # Utilidades y helpers
│   │   │   ├── config.js               # Configuración y preferencias
│   │   │   ├── formatting.js           # Formateo de fechas y nombres
│   │   │   ├── nameOrder.js            # Orden alfabético de personas (apellidos y nombre)
│   │   │   ├── recentProjects.js       # Gestión de proyectos recientes
│   │   │   ├── repositoryCache.js      # Caché de existencia de archivos
│   │   │   └── version.js              # Gestión de versión y modo DEV
│   │   ├── window/              # Gestión de ventanas
│   │   │   ├── cameraWindow.js         # Ventana de captura de cámara
│   │   │   ├── helpWindow.js           # Ventana del manual de uso
│   │   │   ├── groupCoverageWindow.js  # Ver > Fotografías por grupo (avance por grupo)
│   │   │   ├── imageGridWindow.js      # Grid de imágenes capturadas
│   │   │   ├── mainWindow.js           # Ventana principal
│   │   │   ├── repositoryGridWindow.js # Grid de imágenes del repositorio
│   │   │   └── viewerMirrorWindow.js   # Ver > Visor en ventana aparte (otro monitor)
│   │   ├── academicYear.js      # Curso académico del proyecto y fecha de las solicitudes
│   │   ├── appDialogs.js        # Avisos y preguntas del proceso principal, con los modales propios
│   │   ├── database.js          # Gestión de base de datos SQLite
│   │   ├── folderWatcher.js     # Vigilancia de carpetas ingest/imports
│   │   ├── helpContent.js       # Lectura, conversión y búsqueda del manual (Markdown)
│   │   ├── imageManager.js      # Procesamiento y gestión de imágenes
│   │   ├── imageCrop.js         # Recortar una foto capturada guardando su original, y restaurarlo
│   │   ├── imageOrientation.js  # Leer y cambiar la orientación EXIF de un JPEG sin recomprimir
│   │   ├── ingestFolder.js      # Carpeta de entrada (ingest) del proyecto y su vigilante
│   │   ├── logger.js            # Sistema de logging
│   │   ├── pendingRequests.js   # Solicitudes de carnet y publicación: listar, revisar y archivar
│   │   ├── photoReports.js      # PDF de usuarios sin foto y de fotografías por grupo
│   │   ├── receiptPrinter.js    # Impresión de recibos con el auxiliar de Windows (native/receipt-printer)
│   │   ├── replacedArchive.js   # Carpeta Reemplazadas del depósito: leerla y purgarla
│   │   ├── repositoryMirror.js  # Copia local de la carpeta del depósito
│   │   ├── updateManager.js     # Envoltorio de electron-updater (comprobar, descargar, instalar)
│   │   ├── workspaces.js        # Espacios de trabajo: combinaciones guardadas de las opciones de Ver
│   │   └── xmlParser.js         # Parseo de archivos XML de usuarios
│   ├── help/          # Manual de uso en Markdown (pages.json + una página por área)
│   ├── preload/       # Scripts preload (comunicación segura entre procesos)
│   ├── renderer/      # Proceso de renderizado (interfaz de usuario)
│   │   ├── components/                  # Componentes modulares de UI
│   │   │   ├── modals/                  # Componentes de modales
│   │   │   │   ├── AddTagModal.js           # Modal para agregar etiquetas a imágenes
│   │   │   │   ├── ChoiceModal.js           # Pregunta con varias respuestas y Cancelar
│   │   │   │   ├── CropModal.js             # Rectángulo de recorte de una foto capturada y su geometría
│   │   │   │   ├── ConfirmModal.js          # Modal de confirmación genérico
│   │   │   │   ├── ExportOptionsModal.js    # Modal de opciones de exportación
│   │   │   │   ├── InfoModal.js             # Modal informativo genérico
│   │   │   │   ├── NewProjectModal.js       # Modal de creación de proyectos
│   │   │   │   ├── PhotoRosterModal.js      # Opciones del listado en PDF con fotografías por grupo
│   │   │   │   ├── ProjectInfoModal.js      # Modal de información del proyecto
│   │   │   │   ├── ReplacedArchiveModal.js  # Purgar las fotos reemplazadas del depósito
│   │   │   │   ├── PendingRequestsModal.js  # Revisar y archivar solicitudes huérfanas o del curso anterior
│   │   │   │   ├── ExportScopeModal.js      # A qué usuarios alcanza una exportación
│   │   │   │   ├── UpdateModal.js           # Modal de actualizaciones disponibles
│   │   │   │   ├── WorkspacesModal.js       # Ventana Espacios de trabajo (aplicar, crear, gestionar)
│   │   │   │   └── UserImageModal.js        # Modal de vista previa de imágenes
│   │   │   ├── AppDialogManager.js      # Muestra en orden los avisos y preguntas del proceso principal
│   │   │   ├── CaptureHistoryManager.js # Tira de miniaturas del historial de capturas
│   │   │   ├── DragDropManager.js       # Gestión de drag & drop de imágenes
│   │   │   ├── ExportManager.js         # Coordinador de exportaciones (CSV/imágenes)
│   │   │   ├── HelpViewer.js            # Índice, páginas, búsqueda y Atrás del manual
│   │   │   ├── ImageGridManager.js      # Gestión de grid de imágenes capturadas
│   │   │   ├── ImageTagsManager.js      # Gestión de etiquetas de imágenes
│   │   │   ├── KeyboardNavigationManager.js # Navegación por teclado en tabla de usuarios
│   │   │   ├── LazyImageManager.js      # Carga lazy de imágenes (IntersectionObserver)
│   │   │   ├── MenuEventManager.js      # Coordinador de eventos de menú
│   │   │   ├── OrlaExportManager.js     # Listado en PDF de pagos de la orla de graduación
│   │   │   ├── PhotoRosterExportManager.js # Listado en PDF con fotografías por grupo
│   │   │   ├── ProgressManager.js       # Gestión de modal de progreso
│   │   │   ├── ProjectManager.js        # Gestión de ciclo de vida de proyectos
│   │   │   ├── SelectionModeManager.js  # Gestión de modo multi-selección
│   │   │   ├── ThumbnailGridManager.js  # Ver > Vista de miniaturas (cuadrícula en lugar de la tabla)
│   │   │   ├── UserDataManager.js       # Gestión de carga de datos de usuarios/grupos
│   │   │   ├── UserRowRenderer.js       # Renderizado de filas de usuarios
│   │   │   └── VirtualScrollManager.js  # Virtual scroll para lista de usuarios
│   │   ├── core/                        # Módulos core del renderer
│   │   │   ├── BaseModal.js             # Clase base para modales
│   │   │   ├── modalEscape.js           # Esc pulsa el botón de cancelar del diálogo de delante
│   │   │   └── store.js                 # Estado global de la aplicación
│   │   ├── utils/                       # Utilidades del renderer
│   │   │   └── imageUrl.js              # URLs app-img:// de las fotos
│   │   ├── index.html           # HTML de la ventana principal
│   │   ├── renderer.js          # Lógica principal de la UI (coordinador)
│   │   ├── styles.css           # Estilos globales
│   │   ├── camera.html          # HTML de la ventana de cámara
│   │   ├── camera.js            # Lógica de captura desde webcam
│   │   ├── image-grid.html      # HTML del grid de imágenes capturadas
│   │   ├── image-grid.js        # Lógica del grid de capturadas
│   │   ├── repository-grid.html # HTML del grid del repositorio
│   │   ├── repository-grid.js   # Lógica del grid del repositorio
│   │   ├── help.html            # HTML de la ventana del manual
│   │   ├── help.js              # Arranque de la ventana del manual
│   │   ├── viewer-mirror.html   # Ventana que repite el visor
│   │   └── viewer-mirror.js     # Recibe la foto del visor y la pinta
│   └── shared/        # Código compartido (tipos, constantes, utilidades)
├── native/
│   └── receipt-printer/ # Auxiliar en C# que imprime los recibos con el motor de texto de Windows
├── scripts/           # release-notes.mjs, build-receipt-printer.mjs
├── tests/             # Tests unitarios (Jest)
│   └── unit/
│       ├── components/          # Tests de componentes del renderer
│       │   ├── modals/          # Tests de modales
│       │   └── ...              # Tests de managers
│       └── ...
├── assets/
│   └── icons/         # Iconos de la aplicación
├── public/            # Archivos estáticos
├── package.json       # Dependencias y scripts
└── .gitignore        # Archivos excluidos de git
```

## Arquitectura de Electron

### Proceso Principal (Main Process)
- Controla el ciclo de vida de la aplicación
- Crea y gestiona ventanas
- Acceso completo a APIs de Node.js
- Ubicación: `src/main/`

### Proceso de Renderizado (Renderer Process)
- Interfaz de usuario (HTML/CSS/JS)
- Ejecuta en contexto de navegador
- Acceso limitado por seguridad
- Ubicación: `src/renderer/`

### Script Preload
- Puente seguro entre main y renderer
- Expone APIs específicas al renderer
- Ubicación: `src/preload/`

## Scripts Disponibles

### Ejecución
- `npm start` - Inicia la aplicación en modo producción
- `npm run dev` - Inicia la aplicación en modo desarrollo

### Testing
- `npm test` - Ejecuta suite completa de tests unitarios (Jest)

### Mantenimiento
- `npm run clean` - Limpia node_modules, dist y build completamente
- `npm run clean:dist` - Limpia solo carpetas dist y build
- `npm run install:clean` - Limpia y reinstala dependencias con npm ci

### Módulos nativos
sqlite3 y sharp son N-API e instalan binarios precompilados: no se recompilan
para Electron. electron-builder ejecuta `install-app-deps` por su cuenta antes
de empaquetar, así que no hay ningún paso manual.

El auxiliar de impresión de recibos (`native/receipt-printer/ReceiptPrinter.cs`)
se compila con `scripts/build-receipt-printer.mjs`, que usa el compilador de C#
de .NET Framework 4.x incluido en Windows 10 y 11: no hay que instalar nada. Lo
genera en `build/receipt-printer/` y se ejecuta solo, sin repetir el trabajo si
el `.exe` es más reciente que el código:
- al instalar dependencias (`postinstall`) y antes de `npm run dev` (`predev`),
  con `--optional`: si no puede compilar, avisa y los recibos salen por Chromium
- antes de empaquetar y de publicar (`predist:*`, `prerelease:publish`), sin
  `--optional`: si falla, se para, para no publicar un instalador sin él
- a mano, `npm run build:receipt-printer`
El instalador lo lleva como recurso (`build.win.extraResources`) en
`resources/receipt-printer/`.

### Distribución
- `npm run dist:win` - Build para Windows (NSIS instalador x64)
- `npm run dist:mac` - Build para macOS (DMG x64)
- `npm run dist:linux` - Build para Linux (AppImage x64)

### Versionado y publicación
El flujo completo, con verificación y vuelta atrás, está en
`docs/ACTUALIZACIONES_Y_RELEASE_PLAN.md` (sección 1). Resumen:
- `npx commit-and-tag-version --dry-run` - Muestra la versión que saldría y el changelog, sin tocar nada
- `npm run release` - Versión calculada de los commits (`feat` sube minor, `fix`/`perf` patch), CHANGELOG, commit y tag. Solo local
- `npm run release:minor` / `npm run release:major` - Igual, forzando el salto
- `npm run release:publish` - Push con tags, instalador NSIS y Release de GitHub con `latest.yml`. Necesita `GH_TOKEN` (`gh auth token`)
- `npm run release:notes` - Copia la sección del CHANGELOG a la Release de GitHub

Las Releases de GitHub son el servidor de actualizaciones de la aplicación:
una release en borrador o sin `latest.yml` no llega a nadie.

## Arquitectura del Proceso Principal

El proceso principal ha sido refactorizado en módulos organizados por responsabilidad:

### Manejadores IPC (ipc/)
- **exportHandlers.js**: Gestiona las exportaciones (15 manejadores)
  - `export-csv`: CSV para carnets. **Solo los usuarios con foto en el
    depósito**; el resto se cuentan como ignorados
  - `export-inventory-csv`: 3 CSVs separados (Alumnado.csv, Personal.csv, Grupos.csv)
  - `export-images`: Imágenes con nombre por ID (NIA/DNI), en una subcarpeta
    por código de grupo
  - `export-repository-images`: Igual, pero con las fotos del depósito;
    `count-repository-images` da las cifras del resumen previo
  - `export-images-name`: Imágenes con formato "Apellido1 Apellido2, Nombre"
  - `export-inventory-images`: Imágenes del depósito en un ZIP plano
  - `export-to-repository`: Exporta las fotos capturadas a la carpeta del depósito
  - `export-photo-roster-pdf`: listado con fotografías por grupo, un PDF por
    grupo con una rejilla de 6 × 6 por página (no es la orla de graduación)
  - `export-paid-users-list-pdf` y `export-paid-users-csv`: listados de pagos
    de la orla de graduación (menú **Orla**)
  - `export-missing-photos-pdf` y `export-group-coverage-pdf`: listados de
    quién no tiene foto y estadísticas por grupo (ver `photoReports.js`)
  - `scan-replaced-archive` y `purge-replaced-archive`: la carpeta
    `Reemplazadas` (ver `replacedArchive.js`)
- **miscHandlers.js**: Diálogos del sistema, etiquetas de imágenes, y utilidades generales
  - Incluye `update-window-title` para actualizar título de ventana
- **projectHandlers.js**: Gestión completa de ciclo de vida de proyectos
  - Creación, apertura, cierre de proyectos
  - Actualización de XML con análisis de cambios
  - Gestión de usuarios eliminados (movidos a grupo "Eliminados")
- **userGroupImageHandlers.js**: CRUD de usuarios, grupos, imágenes y relaciones

### Gestión de Ventanas (window/)
- **mainWindow.js**: Ventana principal con gestión de usuarios e imágenes
- **cameraWindow.js**: Ventana de captura desde webcam
- **imageGridWindow.js**: Visualización en grid de imágenes capturadas
- **repositoryGridWindow.js**: Visualización en grid de imágenes del repositorio
- **printedCardsWindow.js**: Últimos carnets impresos
- **groupCoverageWindow.js**: Ver > Fotografías por grupo (`Ctrl+Shift+E`).
  Por grupo, usuarios con foto y sin ella, coloreados de rojo (ninguna) a
  verde (completo) pasando por amarillo. El selector **Fotografías** elige qué
  foto cuenta: la capturada enlazada o la del depósito
  - Datos de `getGroupPhotoCoverage(hasPhoto)` en `database.js` (handler
    `get-group-photo-coverage`, con `source` `captured` o `repository`):
    agrupa por el `group_code` de los usuarios, así que no salen grupos
    vacíos, y deja fuera `ELIMINADOS`. Sin `hasPhoto` cuenta `image_path`
  - Con el depósito, el handler busca `{NIA|documento}.jpg/.jpeg` con
    `findUserRepositoryImage()` de las exportaciones, en el índice de la copia
    local si ya ha cargado y si no leyendo la carpeta. Sin depósito
    configurado, o si la carpeta no existe, devuelve el error y la ventana lo
    muestra
  - `main.js` le manda `repository-changed` (`notifyGroupCoverageRepositoryChanged()`)
    en los mismos casos que a la ventana principal; con la fuente del depósito
    recarga agrupando los avisos en 500 ms, porque llegan uno por archivo
  - Se refresca con `captured-images-changed`, que ahora se envía también a
    esta ventana (contexto `groupCoverageWindow`), al aplicar una
    actualización del XML (`confirm-update-xml`, también si falla a medias) y
    al recuperar el foco
  - `closeCurrentProject()` la cierra: sus cifras son del proyecto
  - Las funciones puras de `group-coverage.js` se exportan para los tests
    (`tests/unit/renderer/groupCoverage.test.js`)
- **helpWindow.js**: Manual de uso. Si ya está abierta, `open({ target })` solo
  la lleva a la página pedida
- **viewerMirrorWindow.js**: Ver > Visor en ventana aparte (`Ctrl+Shift+F`), la
  misma foto que el visor principal, para llevarla a otro monitor. No necesita
  proyecto
  - El renderer principal manda `viewer-image-changed` con `{ path, url }` en
    `publishViewerImage()` (cambio de foto, lista vacía, giro y arranque); el
    gestor guarda la última y la reenvía como `viewer-mirror-image`, y una
    ventana recién abierta la pide con `get-viewer-mirror-image`. **La URL va
    ya construida** con la versión de una foto girada, para no depender de que
    `localStorage` haya llegado a la otra ventana
  - Doble clic o `F11` alternan pantalla completa (`viewer-mirror-set-fullscreen`
    desde el proceso principal), `Esc` sale
  - Recuerda posición y pantalla completa en `config.json` bajo `viewerMirror`,
    solo si cae en un monitor conectado (`isOnScreen()`). Se guarda el área de
    contenido y la ventana va sin menú (`removeMenu()`): con escalado
    fraccionario (225 %) los límites de la ventana, o ocultar el menú después
    de colocarla, la hacían crecer unos píxeles en cada apertura
  - `Menu.setApplicationMenu()` vuelve a poner el menú en todas las ventanas en
    Windows, así que `MenuBuilder.build()` avisa con `onApplicationMenuSet` y
    `main.js` se lo vuelve a quitar (`viewerMirrorWindowManager.removeMenu()`);
    sin eso la barra reaparecía al maximizar y restaurar

#### Cómo añadir una ventana nueva

Toda ventana que no sea la principal es **secundaria** y debe cerrarse con ella.
No es solo cuestión de orden: si queda una ventana abierta, `window-all-closed`
no se dispara, `app.quit()` nunca se ejecuta y la aplicación deja de terminar.

Un gestor nuevo tiene que cumplir dos cosas:

1. **Exponer `close()`**, siguiendo el patrón de los existentes: cerrar la
   ventana solo si sigue viva (`isDestroyed()`) y dejar la referencia a `null`
   en cualquier caso. El handler `'closed'` ya limpia la referencia por su
   cuenta, pero un llamante puede llegar con una obsoleta.
2. **Registrarse en `secondaryWindowManagers`**, el array de `main.js` situado
   junto a la creación de los gestores. `closeSecondaryWindows()` lo recorre
   desde el handler `'closed'` de la ventana principal.

Ambos requisitos están cubiertos por `tests/unit/main/windowManagers.test.js`,
que recorre la carpeta `src/main/window/` en lugar de una lista fija: un gestor
sin `close()`, o que no aparezca en el array de `main.js`, hace fallar la suite.

### Utilidades (utils/)
- **config.js**: Persistencia de configuración y preferencias de usuario
  - `lastExportFolder`: última carpeta de exportación, común a todas las
    exportaciones. `getLastExportFolder()` sube a la carpeta existente más
    cercana si ya no está
  - `exportDefaults` (`{ mode, boxSize, maxSize }`, Preferencias >
    Exportación de imágenes): con qué se abren `ExportOptionsModal` y la parte
    de fotos de `InventoryExportOptionsModal`. `getExportDefaults()` rellena
    lo que falte con copia, 800 px y 500 KB y lleva los números a los límites
    de los campos. Los dos modales lo leen **en cada apertura** con el
    `getDefaults()` que les pasa `renderer.js`; lo que se cambie en el cuadro
    vale solo para esa exportación
- **formatting.js**: Formateo de fechas (ISO a español) y nombres de archivo
- **nameOrder.js**: Orden alfabético de personas, común a la lista y a las
  exportaciones: primer apellido, segundo y nombre, comparados con
  `Intl.Collator('es')` sin tildes, mayúsculas, espacios ni guiones, y con la
  `ñ` como letra propia. `getUsers()` ordena en JavaScript: el `ORDER BY` de
  SQLite compara bytes y mandaba «Álvarez» detrás de «Zapata»
- **recentProjects.js**: Gestión de lista de proyectos recientes
- **repositoryCache.js**: Caché con TTL para verificación de existencia de archivos
- **version.js**: Gestión de versión de la aplicación con detección de modo DEV

### Menú (menu/)
- **menuBuilder.js**: Constructor centralizado del menú con gestión de estado y callbacks

### Módulos Core
- **database.js**: Gestión completa de SQLite (usuarios, grupos, imágenes, tags)
- **folderWatcher.js**: Vigilancia de carpetas ingest/imports con chokidar
- **imageManager.js**: Procesamiento de imágenes con sharp (validación, redimensionamiento)
- **ingestFolder.js**: Carpeta de entrada de cada proyecto. Por defecto es
  `ingest` dentro del proyecto, pero se puede redirigir a cualquier otra
  (Proyecto > Configurar carpeta de entrada, igual que el depósito) para que
  otros programas le entreguen fotos. Se
  guarda en `project_settings` bajo `ingestPath`; sin esa clave se usa la de
  por defecto.
  - Todo lo que escribe en la carpeta de entrada (webcam, arrastrar y soltar)
    pide la ruta activa con `getActiveIngestPath(state)`; no reconstruirla con
    `path.join(projectPath, 'ingest')`, o las fotos acaban donde nadie vigila
  - `startIngestWatcher()` es el único sitio que crea el vigilante, en las
    tres aperturas (crear, abrir y proyecto reciente); el cambio de carpeta lo
    reinicia sin reabrir el proyecto
  - Si la carpeta configurada no existe al abrir (unidad desconectada), se
    vigila la de por defecto, se avisa y el ajuste se conserva
  - Se rechazan la carpeta del proyecto o una que la contenga, `imports` y lo
    que haya dentro, y el depósito y su copia local (dentro o conteniéndolos):
    el vigilante mueve todo lo nuevo, un nivel de subcarpetas incluido
  - Las imágenes que ya estaban en la carpeta al empezar a vigilarla no se
    importan; solo las que llegan después
  - **Giro de las fotos entrantes** (Proyecto > Girar las fotos entrantes):
    para cámaras que no anotan la orientación. `project_settings` bajo
    `incomingRotation` (90, 180 o 270; sin clave, no se gira), cargado en
    `state.incomingRotation` al arrancar el vigilante, que es por donde pasan
    las tres aperturas; un cambio desde el menú vale para la foto siguiente
    - `FolderWatcher` acepta `processImport(destino, origen)`, que corre con
      la foto ya en `imports` y antes de anunciarla; ahí se aplica el giro
      (`applyIncomingRotation`). Si falla, la foto se importa como vino
    - Las capturas de la webcam se escriben en la carpeta de entrada, pero ya
      vienen giradas con el botón de la ventana de cámara: `save-captured-image`
      las marca con `markWebcamCapture()` y el giro las deja pasar
  - `folderWatcher` mueve con copia y borrado cuando el `rename` falla con
    `EXDEV` (otra unidad o recurso de red), y aplica los patrones de archivos
    ocultos a la ruta relativa a la carpeta vigilada: sobre la ruta completa,
    una carpeta bajo un directorio que empiece por punto ignoraba todo
- **imageOrientation.js**: Gira las fotos cambiando la etiqueta de orientación
  EXIF, nunca los píxeles: no se recomprime nada y los datos de imagen quedan
  byte a byte. Si la foto no tiene EXIF, se añade un segmento mínimo; si lo
  tiene sin orientación, se añade una copia del primer directorio con la
  etiqueta al final de los datos EXIF (así ningún desplazamiento cambia).
  Todo lo demás ya respeta la etiqueta: Chromium en el visor, `sharp().rotate()`
  en miniaturas, exportaciones y listados en PDF, y las exportaciones escriben la foto
  derecha. `rotateImageFile()` escribe con nombre temporal y renombra
  - El giro manual es `rotate-captured-image` (solo fotos de `imports`), que
    avisa a la ventana principal y al cuadro de capturadas con
    `captured-image-rewritten`, el mismo aviso del recorte. Si la foto tiene
    original guardado por un recorte, lo gira también
  - **La foto conserva su nombre al girarla**, y las URL `app-img://` se sirven
    con caché: `imageUrl.bumpVersion(ruta)` le da una versión que se añade a
    todas sus URL. Se guarda en `localStorage`, que comparten todas las
    ventanas y que sobrevive a un Ctrl+R. En disco, la caché de miniaturas usa
    la fecha de modificación, que cambia al reescribir el archivo
- **imageCrop.js**: Recorte de una foto capturada desde el menú contextual del
  visor (botón derecho sobre `#current-image`, `initializeViewerContextMenu()`
  en `renderer.js`), con `CropModal`
  - El primer recorte copia la foto a `imports/Originales/<nombre>` y **nunca
    la sobrescribe**; cada recorte se hace desde esa copia. El listado de
    `imports` solo lee el primer nivel, así que no aparece como foto
  - El rectángulo va en píxeles de la foto **ya girada** por su EXIF:
    `sharp().rotate().extract()` recorta en ese espacio (comprobado), y
    `keepExif()` conserva los datos de la cámara con la orientación a 1.
    `get-captured-image-crop-source` da al modal la ruta del original (o de la
    foto) y sus medidas giradas (`displaySize()`), que el modal usa como
    referencia en lugar de las de Chromium
  - Handlers `crop-captured-image` y `restore-captured-image`, solo para
    archivos del primer nivel de `imports` (`resolveCapturedImage()`), y los
    dos avisan con `captured-image-rewritten`. Restaurar mueve el original a
    su sitio, le pone la fecha actual (la caché de miniaturas va por fecha) y
    borra `Originales` si queda vacía
  - La geometría del rectángulo (`cropGeometry` en `CropModal.js`: mover,
    estirar por bordes y esquinas con o sin proporción, sin salirse de la
    foto) son funciones puras con sus tests. La proporción elegida se
    recuerda en `localStorage`
- **replacedArchive.js**: La carpeta `Reemplazadas` del depósito, donde cada
  exportación deja las fotos que sustituyó (`<AAAAMMDDHHMMSS>_<equipo>/`, ver
  exportHandlers). Solo crece, y como el depósito es compartido entre los
  equipos del centro **no se borra nada por su cuenta**: Proyecto > Purgar
  fotos reemplazadas abre `ReplacedArchiveModal`, que enseña los cortes por
  antigüedad con lo que borraría cada uno, y la purga se pide a mano
  - `scanReplacedArchive(ruta, { withSizes })`: los tamaños cuestan un `stat`
    por foto, que sobre Drive es lo lento, así que el aviso de apertura pide
    solo recuentos y la ventana pide también bytes
  - `purgeReplacedRuns()` borra **únicamente** las carpetas cuyo nombre encaja
    con el de una ejecución (`parseRunName()`); lo que alguien haya dejado ahí a
    mano no se toca, y lo que no se pudo borrar se devuelve en `failed`
  - `shouldNoticeArchive()` decide el aviso: más de `NOTICE_PHOTOS` fotos, algo
    de más de seis meses (ofrecer una purga que no borraría nada es peor que
    callarse) y como mucho una vez al mes (`config.json` bajo
    `replacedArchive.lastNotice`, escrito **antes** de preguntar). Lo dispara
    `offerReplacedArchivePurge()` en `main.js`, 30 s después de que el mirror
    arranque, y si se acepta manda el mismo evento que el menú
- **thumbnailService.js**: Miniaturas de las fotos, en
  `%APPDATA%/Edu User Capture/thumbnail-cache`, servidas por el protocolo
  `app-img://` cuando la URL lleva `size`
  - **El nombre es `sha1(ruta|tamaño)`, sin la fecha**, y la fecha de la foto
    se graba con `utimes` en la propia miniatura: así una foto tiene una sola
    miniatura por tamaño y al cambiarla se sobrescribe. Antes la fecha iba en
    el nombre, de modo que cada reemplazo o giro abandonaba la anterior con un
    nombre que ya nadie volvería a pedir
  - `utimes` guarda milisegundos enteros, así que la comparación es al
    milisegundo redondeado (`sameMoment()`); con `===` sobre el valor crudo no
    acertaría nunca y se regeneraría todo en cada lectura
  - `pruneCache()` no intenta saber cuáles están huérfanas —el nombre es un
    hash, no se puede— sino que **pone techo** a la carpeta (200 MB, bajando al
    80% al podar) y barre los `.tmp` de más de 5 minutos. Ordena por fecha de
    creación, que es cuando se hizo la miniatura; la de modificación ya lleva
    la de la foto. Se ejecuta una vez, 60 s después de arrancar
  - `measureCache()` y `clearCache()` alimentan Preferencias > Mantenimiento
- **repositoryMirror.js**: Copia local de la carpeta del depósito, y su
  sincronización. **No hay integración con la API de Google Drive**: el
  depósito es una carpeta del disco, normalmente sincronizada por el cliente
  de escritorio de Drive, y la aplicación solo lee y escribe archivos
- **xmlParser.js**: Parseo de XML de usuarios con fast-xml-parser
- **logger.js**: Sistema de logging centralizado. El `app.log` del proyecto se
  corta al llegar a 5 MB y se conservan los dos anteriores (`app.1.log` y
  `app.2.log`): antes cada apertura añadía al mismo archivo y nunca se
  archivaba, así que pasaba de 8 MB en un proyecto en uso
  - Se comprueba al abrir el proyecto y con cada entrada, contando lo escrito
    en lugar de preguntar al sistema de archivos por el tamaño
  - El corte cierra el stream, que vacía lo pendiente de forma asíncrona;
    mientras tanto las entradas se encolan y se escriben al reabrir, así que no
    se pierde ninguna. Si el proyecto se cierra o se abre otro en ese momento,
    la cola se escribe al final del log que se deja atrás
  - Si el renombrado falla (otra ventana con el archivo abierto), se anota en
    la consola y el log sigue creciendo: mejor eso que perder lo que dice
- **workspaces.js**: Espacios de trabajo del menú **Ver**. Cada uno guarda las
  seis opciones de fotos y paneles (`VIEW_KEYS`: fotografías capturadas y del
  depósito, indicadores, pagos de la orla, historial de capturas y vista
  de miniaturas); los filtros no, ni la fuente de las miniaturas. `WorkspaceStore` con almacenamiento inyectado; en la aplicación,
  `config.json` bajo `workspaces` (`custom`, `hiddenBuiltIns`)
  - Predefinidos: Captura, Revisión y Carnets. No se cambian ni se borran,
    solo se ocultan del menú
  - El submenú **Ver > Espacios de trabajo** da `Ctrl+1…9` a los nueve
    primeros visibles y marca el primero cuya combinación coincide con la
    vista (`matching()`). Por eso `main.js` reconstruye el menú
    (`refreshWorkspaces()`) tras cada cambio de una de esas opciones, a mano
    o por espacio, y tras cada cambio de la lista
  - Las cinco opciones se cambian con `setShow...()` de `main.js`, que usan
    tanto el menú como `applyWorkspace()`; este solo toca las que difieren
  - Una opción nueva del menú Ver que cambie la forma de ver la lista debe
    añadirse a `VIEW_KEYS`, a los predefinidos y a `DISPLAY_SETTERS`
- **appDialogs.js**: Avisos y preguntas del proceso principal. **No se usan los
  cuadros de mensaje del sistema** (`dialog.showMessageBox`,
  `dialog.showErrorBox`), ni `alert()`/`confirm()` en el renderer: rompen la
  apariencia de la aplicación. Desde el proceso principal,
  `showAppMessage(ventana, { title, message, detail })` y
  `askAppQuestion(ventana, { title, message, detail, choices, cancel })`, que
  devuelve el índice de la opción o `CANCELLED` (-1)
  - Envían `app-dialog` a la ventana principal, que los muestra con `InfoModal`
    o `ChoiceModal` a través de `AppDialogManager`, **uno detrás de otro**, y
    contesta por `app-dialog-response`
  - Sin ventana, con la ventana cerrada o recargándose, la promesa se resuelve
    como cancelada: nada se queda esperando
  - Los selectores de archivos y carpetas (`showOpenDialog`,
    `showSaveDialog`) sí siguen siendo los del sistema
  - Las ventanas secundarias no tienen estos modales: la de cámara avisa con un
    mensaje sobre la vista previa y la de carnets impresos lleva su propio
    diálogo de confirmación
- **updateManager.js**: Comprobación de versiones nuevas contra las Releases de
  GitHub mediante `electron-updater`. Nunca descarga ni instala por su cuenta:
  la descarga (diferencial, con progreso) empieza cuando la persona pulsa
  "Descargar", y al acabar elige "Reiniciar e instalar" o "Al cerrar la
  aplicación". Ojo: `autoInstallOnAppQuit` se activa al empezar la descarga,
  porque `electron-updater` solo registra la instalación al salir si ya estaba
  activo al terminar; en pruebas con `--dev-updates`, desactivarlo antes de
  cerrar la aplicación. La comprobación automática arranca 15 s
  después de mostrar la ventana, como mucho una vez cada 24 h, y si falla solo
  lo anota en el log; la manual (Ayuda > Buscar actualizaciones, o desde Acerca
  de) muestra siempre el resultado. Solo funciona en la aplicación empaquetada;
  en desarrollo, `npm run dev -- --dev-updates` con un `dev-app-update.yml`
  local. Preferencias en `config.json` bajo `updates` (`autoCheck`,
  `lastCheck`, `skippedVersion`); `autoCheck` se cambia desde Archivo >
  Preferencias > Actualizaciones. Una comprobación pedida mientras otra está en
  marcha se une a ella en lugar de rechazarse. El flujo de publicación del que depende está
  en `docs/ACTUALIZACIONES_Y_RELEASE_PLAN.md`.

## Arquitectura del Proceso de Renderizado

El proceso de renderizado ha sido refactorizado siguiendo una arquitectura modular basada en componentes (Phase 4). El archivo monolítico `renderer.js` (originalmente 2091 líneas) se ha reducido a 1386 líneas (reducción del 34%) extrayendo funcionalidad cohesiva en componentes especializados.

### Principios de Diseño

#### Patrón IIFE (Immediately Invoked Function Expression)
Todos los componentes utilizan IIFE para evitar contaminación del scope global:
```javascript
(function(global) {
  'use strict';
  class ComponentName { /* ... */ }

  // Export UMD
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ComponentName };
  } else if (typeof window !== 'undefined') {
    global.ComponentName = ComponentName;
  }
})(typeof window !== 'undefined' ? window : global);
```

#### Arquitectura basada en Callbacks
Los componentes se comunican mediante callbacks configurados en la inicialización:
```javascript
const manager = new SomeManager({
  onEvent: (data) => { /* handle event */ },
  getSomeData: () => { /* provide data */ }
});
```

#### Patrón de Delegación
`renderer.js` actúa como coordinador, delegando funcionalidad a componentes especializados:
```javascript
// Antes: implementación directa en renderer.js
function someFunction() { /* 50 líneas de código */ }

// Después: delegación al manager
function someFunction() {
  if (someManager) {
    someManager.handleFunction();
  }
}
```

### Componentes de Modales (components/modals/)

Todos los modales extienden `BaseModal` para comportamiento consistente.

- **NewProjectModal.js**: Modal de creación de proyectos
  - Selección de carpeta y archivo XML
  - Validación de inputs
  - Retorna configuración mediante Promise

- **ConfirmModal.js**: Modal de confirmación genérico
  - Mensaje personalizable
  - Retorna `true`/`false` mediante Promise

- **InfoModal.js**: Modal informativo genérico
  - Título y mensaje personalizables
  - Soporte para texto multilínea

- **ExportOptionsModal.js**: Modal de opciones de exportación
  - Modo copia original vs redimensionamiento
  - Configuración de tamaño y calidad
  - Retorna opciones mediante Promise

- **AddTagModal.js**: Modal para agregar etiquetas a imágenes
  - Input de texto para etiqueta
  - Retorna texto de etiqueta mediante Promise

- **UserImageModal.js**: Modal de vista previa de imágenes de usuario
  - Muestra imagen capturada o del repositorio
  - Título con nombre completo del usuario
  - Etiqueta distintiva para imágenes del repositorio

- **ProjectInfoModal.js**: Modal de información del proyecto (Proyecto > Información
  del proyecto)
  - Nombre del proyecto y ubicación de todas sus carpetas: proyecto, `ingest`,
    `imports`, base de datos, depósito de imágenes y su copia local
  - Recuento de usuarios (total y por tipo), grupos, fotos enlazadas, usuarios
    sin foto, imágenes en `imports` e imágenes con etiquetas
  - Los datos llegan del proceso principal en una sola llamada
    (`get-project-details`), separada de `get-project-info` porque esta última
    la refresca la barra de estado a menudo y debe seguir siendo barata
  - La ruta del XML se registra al crear el proyecto y al actualizarlo; los
    proyectos anteriores a esto la muestran como "No configurado"
  - Es de solo lectura: la carpeta de entrada se cambia desde el menú
    Proyecto, como el depósito. Su fila lleva una nota si es personalizada o si
    no está disponible, y se refresca sola si se cambia con la ventana abierta

- **PhotoRosterModal.js**: Opciones del listado en PDF con fotografías por grupo
  - Selección de fuente de fotos (capturadas vs repositorio)
  - Configuración de calidad de imagen (0-100)
  - Retorna opciones mediante Promise

### Componentes Managers (components/)

#### ExportManager.js
**Propósito**: Coordinador central de todas las exportaciones (CSV e imágenes)

**Funcionalidades**:
- Exportación de CSV para carnets
- Exportación de imágenes por ID (NIA/DNI)
- Exportación de imágenes por nombre completo
- Exportación a repositorio
- Gestión de usuarios a exportar (selección, duplicados, filtros)

**Patrón**: Consolida código duplicado de 3 funciones casi idénticas en un único flujo reutilizable

#### ImageTagsManager.js
**Propósito**: Gestión completa del sistema de etiquetado de imágenes

**Funcionalidades**:
- Agregar etiquetas a imágenes
- Cargar y mostrar etiquetas
- Eliminar etiquetas
- Mostrar modal con todas las imágenes etiquetadas
- Actualización automática de UI

#### SelectionModeManager.js
**Propósito**: Gestión del modo de selección múltiple de usuarios

**Funcionalidades**:
- Activar/desactivar modo selección
- Toggle de selección individual
- Seleccionar/deseleccionar todos
- Actualización de header de tabla (checkbox selectAll)
- Sincronización con estado global para retrocompatibilidad

**Estado**: Mantiene `isActive` y `selectedUsers` (Set)

#### DragDropManager.js
**Propósito**: Gestión de drag & drop de archivos de imagen

**Funcionalidades**:
- Highlight visual de zona de drop
- Filtrado de archivos (solo JPG/JPEG)
- Procesamiento de múltiples archivos
- Integración con sistema de importación

#### ProgressManager.js
**Propósito**: Gestión del modal de progreso

**Funcionalidades**:
- Mostrar/ocultar modal de progreso
- Actualizar barra de progreso (porcentaje)
- Actualizar mensaje y detalles
- Listener IPC para eventos de progreso del main process

#### LazyImageManager.js
**Propósito**: Carga lazy de imágenes usando IntersectionObserver API

**Funcionalidades**:
- Observación automática de imágenes con clase `.lazy-image`
- Carga bajo demanda cuando la imagen entra en viewport
- Configuración de rootMargin y threshold
- Métodos para observar/desobservar imágenes individuales
- Carga inmediata de todas las imágenes (fallback)

**Optimización**: Reduce carga inicial de página con muchas imágenes de usuario

#### CaptureHistoryManager.js
**Propósito**: Tira vertical de miniaturas a la derecha del visor grande, con el
historial de capturas del proyecto

**Funcionalidades**:
- Lista todas las capturas de la carpeta `imports`, las más recientes primero
- Al pulsar una miniatura, el visor grande se desplaza hasta esa foto
- Marca la miniatura que el visor está mostrando y la trae a la vista si queda fuera
- Cabecera con la fecha cada vez que cambia el día, y la hora de captura bajo
  cada miniatura, para localizar la sesión en la que se hizo un enlace erróneo
- Carga diferida de las miniaturas con IntersectionObserver
- Se activa y desactiva desde Ver > Historial de capturas (preferencia persistente)
- Marca las fotos enlazadas (atenuadas, con ✓ verde) y las enlazadas a varios
  usuarios (borde y círculo rojos con el número), con los nombres en el
  tooltip. `setLinks(ruta → nombres)` sustituye el conjunto entero y se llama
  desde `displayUsers()` y `applyCapturedImageChange()` con `allUsers`, no
  con la lista filtrada: una foto está enlazada aunque su dueño no se vea. Las
  rutas se comparan sin distinguir mayúsculas ni el sentido de las barras

**Cuidado con la clase `visible`**: `utilities.css` declara una utilidad global
`.visible { display: block !important }`. Cualquier componente que use ese
nombre para marcar su estado acaba renderizado como bloque, pase lo que pase en
su propia hoja. Aquí eso rompía el flex del panel y la lista crecía hasta caber
entera (144 000 px) en lugar de desplazarse, dejando la tira sin barra de
scroll. Por eso las clases de estado son `is-open` e `is-shown`.
`.no-project-placeholder` sortea lo mismo con un `display: flex !important`.

**Fecha y hora**: se leen del nombre del archivo, que es el único registro que
existe de cuándo se capturó (`folderWatcher` renombra a `YYYYMMDDHHMMSS`, con
`_1`, `_2`... si coinciden en el mismo segundo). Las imágenes traídas por la
importación masiva por ID conservan su nombre original, no pasan por el
vigilante y por tanto no tienen marca temporal: se agrupan bajo "Sin fecha en el
nombre" y muestran el nombre del archivo en lugar de la hora. El nombre completo
está siempre en el tooltip.

**Nota**: no tiene fuente de datos propia. Es un índice visual del mismo array
que ya navega `ImageGridManager`, así que pulsar una miniatura sólo mueve el
cursor del visor; la foto queda seleccionada para enlazarla igual que si se
hubiera llegado a ella con las flechas. `ImageGridManager` avisa de los cambios
de lista con `onImagesLoaded` y de los de cursor con `onImageChange`.

#### ThumbnailGridManager.js
**Propósito**: Ver > Vista de miniaturas (`Ctrl+M`). Cambia la tabla de usuarios
por una cuadrícula de fichas (foto, nombre, apellidos y grupo), con la foto
capturada o la del depósito según el selector **Capturadas | Depósito**

**Cómo encaja**: es otra forma de pintar la misma lista. `displayUsers()` le
pasa `displayedUsers`, los mismos usuarios que la tabla con los mismos
filtros, y una ficha se comporta como una fila: clic con `selectUserRow()`,
doble clic con `showUserImageModal()`, botón derecho con `showContextMenu()` y
casilla en modo selección. `↑`/`↓` en `navigateUsers()` siguen el orden lineal
de la cuadrícula, para que el flujo de enlazar sea el mismo en las dos vistas

**Cuidado**:
- Solo se dibuja la vista visible; `applyUsersViewMode()` pone al día la otra
  al cambiar (la tabla oculta no puede medir sus filas y se re-renderiza al
  volver). Sin proyecto abierto se ve siempre la tabla, que es donde está el
  aviso de "sin proyecto"
- Los caminos que parchean filas en su sitio (`applyCapturedImageChange()`,
  `syncCheckboxes` del modo selección, `repository-changed`) tocan también las
  fichas: `replaceCard()`, `syncCheckboxes()` y `render()`
- Con la fuente **Depósito**, la cuadrícula necesita los datos del depósito
  igual que la columna de fotos: el getter `getShowRepositoryPhotos` de
  `UserDataManager` la tiene en cuenta, y el proceso principal arranca la copia
  local al elegir esa fuente o al abrir el proyecto con ella
- `showThumbnailGrid` se guarda con las demás preferencias de Ver y forma parte
  de los espacios de trabajo; `thumbnailGridSource` se guarda en `config.json`
  aparte (`set-thumbnail-grid-source`)

#### Ordenar por fecha de enlace
**Ver > Ordenar por fecha de enlace** pone arriba a los usuarios enlazados más
recientemente, con la fecha bajo el grupo (fila y ficha de miniaturas)
- La fecha es `users.image_linked_at` (ISO en UTC), añadida con `ALTER TABLE`
  como `orla_paid`: los proyectos antiguos la tienen vacía y esos usuarios van
  al final. La escribe solo `linkImageToUser()`, que la devuelve y los
  handlers la mandan como `linkedAt`
- **No se borra al desvincular** (`unlinkImageFromUser()`,
  `clearCapturedImages()`): el repaso para pedir carnet o publicación suele
  hacerse después de exportar al depósito, que desvincula
- El orden se aplica en `displayUsers()` con `linkDate.sortUsers()`
  (`utils/linkDate.js`), después de los filtros; con él activo,
  `applyCapturedImageChange()` vuelve a pintar la lista en lugar de parchear
  filas, porque el usuario enlazado cambia de sitio
- Preferencia `sortByLinkDate` en `config.json`. Como los filtros, no forma
  parte de los espacios de trabajo

#### ImageGridManager.js
**Propósito**: Gestión del grid de imágenes capturadas del usuario seleccionado

**Funcionalidades**:
- Carga de imágenes del usuario
- Navegación entre imágenes (prev/next), también con las flechas izquierda y
  derecha del teclado
- Actualización de los botones (el visor no lleva contador)
- Callback `onImageChange` para sincronización

#### VirtualScrollManager.js
**Propósito**: Implementación de virtual scrolling para la lista de usuarios

**Funcionalidades**:
- Renderizado eficiente de grandes listas (solo elementos visibles)
- Cálculo dinámico de alturas (spacers)
- Actualización on scroll
- Scroll programático a índice específico

**Optimización**: Permite manejar miles de usuarios sin degradación de performance

#### UserRowRenderer.js
**Propósito**: Renderizado de filas individuales de la tabla de usuarios

**Funcionalidades**:
- Generación de HTML para fila de usuario
- Indicadores visuales (foto, repositorio, duplicados)
- Checkbox de selección en modo multi-selección
- Lazy loading de miniaturas
- `replaceRow()`: reconstruye la fila de un solo usuario en su sitio. Es lo que
  usa `applyCapturedImageChange()` en `renderer.js` al enlazar o desvincular
  una foto: parchea el usuario en los arrays en memoria, recalcula el mapa de
  fotos compartidas y sustituye solo las filas afectadas (el usuario, quienes
  comparten la foto nueva y quienes compartían la anterior), en lugar de
  volver a consultar y repintar la tabla entera por cada uno de los cientos de
  enlaces de una sesión de fotos. Con el filtro de duplicados activo sí recarga,
  porque la pertenencia a esa vista depende justo de lo que ha cambiado

#### ProjectManager.js
**Propósito**: Gestión centralizada del ciclo de vida de proyectos

**Funcionalidades**:
- Crear nuevo proyecto (delega a NewProjectModal)
- Abrir proyecto existente
- Cerrar proyecto (limpia estado main y renderer)
- Cargar datos del proyecto (grupos, usuarios, imágenes)
- Actualizar XML con análisis de cambios
- Gestionar placeholder de "sin proyecto"

**Patrón**: Centraliza toda la lógica de proyectos extraída de renderer.js

#### UserDataManager.js
**Propósito**: Gestión centralizada de carga de datos de usuarios y grupos

**Funcionalidades**:
- Cargar grupos y poblar filtro de grupos
- Cargar usuarios con filtros (búsqueda, grupo, duplicados)
- Iniciar sincronización de repositorio en background
- Actualizar contadores y estado de UI
- Manejo de estado de carga (spinners)

**Patrón**: Separa lógica de carga de datos del coordinador principal

#### MenuEventManager.js
**Propósito**: Coordinador centralizado de eventos de menú

**Funcionalidades**:
- Registrar listeners para todos los eventos IPC de menú
- Gestionar preferencias de visualización (thumbnails, repository, indicators)
- Coordinar acciones de menú con callbacks configurables
- Toggle de modo selección múltiple
- Manejo de shortcuts de teclado

**Patrón**: Desacopla renderer.js de la gestión de eventos de menú

#### PhotoRosterExportManager.js
**Propósito**: Listado en PDF con fotografías por grupo, un documento
administrativo para que el equipo directivo y el profesorado identifiquen a
cada persona. **No es la orla de graduación**: «orla» en la interfaz y en el
código queda solo para el servicio de pago

**Funcionalidades**:
- Pedir grupos, fuente de fotos y calidad con `PhotoRosterModal`
- Un PDF por grupo con todas sus personas, tengan foto o no

#### OrlaExportManager.js
**Propósito**: Listado en PDF de quienes han pagado la orla de graduación

#### KeyboardNavigationManager.js
**Propósito**: Gestión de navegación por teclado en tabla de usuarios

**Funcionalidades**:
- Navegación con flechas arriba/abajo, que además selecciona la fila a la que
  se llega: no hay una tecla aparte para seleccionar
- Las flechas izquierda y derecha son del visor de fotos, no de la lista
- No actúa mientras haya cualquier `.modal.show` abierto
- Scroll automático para mantener elemento visible
- Integración con virtual scroll

**Patrón**: Mejora accesibilidad y usabilidad de la aplicación

### Componentes Core (core/)

#### BaseModal.js
**Propósito**: Clase base para todos los modales

**Funcionalidades**:
- Gestión de apertura/cierre
- `Intro` pulsa el botón indicado en `defaultButtonSelector`. Sin él, `Intro`
  no hace nada en el diálogo: se lo dejan sin poner los que harían algo
  irreversible (purgar, archivar, restaurar) o tienen texto de varias líneas
- Al abrir, quita el foco a cualquier control de **detrás** del diálogo
  (`releaseFocusBehind()`) y no lo devuelve al cerrar (el `keyup` del mismo
  `Intro` caería en él). Con el filtro de grupos enfocado, que desde la
  1.22.0 es un select personalizable, `Intro` abría su lista en lugar de
  contestar el diálogo, y las flechas cambiaban el grupo por debajo
- Prevención de cierre durante loading
- Soporte para Promise-based workflows

**Patrón**: Herencia - todos los modales extienden BaseModal

#### modalEscape.js
`Esc` no lo gestiona `BaseModal` sino un único manejador para todo el
documento, instalado en `initializeModals()`: pulsa el botón marcado con
`data-modal-cancel` en el diálogo `.modal.show` que está delante (el último en
el HTML), si está visible y habilitado. Así cada diálogo cancela por su propio
camino y un diálogo ocupado, con el botón deshabilitado, no se cierra.

**Todo diálogo nuevo debe marcar su botón de cancelar o cerrar** con
`data-modal-cancel`. `tests/unit/core/modalEscape.test.js` lee `index.html` y
falla si a algún diálogo le falta; la única excepción es la barra de progreso.

#### store.js
**Propósito**: Estado global de la aplicación

**Variables**:
- `currentProject`: Proyecto actualmente abierto
- `currentUsers`: Lista de usuarios cargados
- `selectedUser`: Usuario actualmente seleccionado
- `selectionMode`: Estado del modo multi-selección
- `selectedUsers`: Set de usuarios seleccionados

### Acceso a datos

Los componentes llaman directamente a `window.electronAPI`, expuesto por el
preload. No hay una capa de servicios intermedia: existió como andamiaje de la
fase 1 del refactor del renderer, nunca se adoptó, y se eliminó cuando la mitad
de los métodos IPC a los que llamaba ya no existían en el preload.

### Utilidades (utils/)

- **imageUrl.js**: Construcción de las URLs `app-img://` de las fotos
- **groupFilterStepper.js**: grupo anterior o siguiente del filtro sin abrir
  la lista, con la rueda sobre el desplegable cerrado o `Alt+↑/↓` desde
  cualquier parte. Lo usan las tres ventanas con filtro de grupos (principal
  y los dos cuadros). El desplegable cambia al instante, pero el `change` se
  agrupa (`CHANGE_DELAY`, 150 ms) para no guardar ni difundir cada grupo
  intermedio, y no se envía si una búsqueda bloqueó el filtro mientras tanto.
  Se detiene en los extremos; no actúa con el filtro deshabilitado ni con
  `.modal.show`. `KeyboardNavigationManager` ignora ↑/↓ con `Alt`
  - El desplegable es un **select personalizable** (`appearance:
    base-select`, en `forms.css`): Chromium lo abre debajo y con la opción
    elegida centrada, cosa que la lista nativa de Windows no hacía. Sigue
    siendo un `<select>`, así que `value`, `change` y `disabled` no cambian
  - Los cuadros descartan respuestas viejas de `loadUsers()` con un contador,
    como `UserDataManager` en la ventana principal
  - En pruebas por CDP con la ventana tapada, Chromium frena los
    temporizadores y no procesa la entrada simulada: el `change` llega tarde
    y `Input.dispatchMouseEvent` se queda esperando

Hubo aquí un `formatters.js` con formateo de fechas, nombres y edades. Se
eliminó junto con sus 39 tests: no lo importaba nadie, y sus funciones esperaban
usuarios con campos en castellano (`nombre`, `apellido1`, `documento`,
`grupo_codigo`, `fecha_nac`) que el modelo de datos no usa, así que ni siquiera
habrían funcionado. Las versiones vivas de eso están en el proceso principal,
donde se hacen las exportaciones: `calculateAge` en `ipc/exportHandlers.js` y
`capitalizeWords` en `utils/formatting.js`.

### Coordinador Principal (renderer.js)

**Función**: Actúa como coordinador central que:
1. Inicializa todos los componentes
2. Configura callbacks de comunicación inter-componentes
3. Delega funcionalidad a componentes especializados
4. Mantiene compatibilidad con código legacy mediante sincronización de estado
5. Gestiona eventos IPC del main process

**Inicialización**:
```javascript
// 1. Crear instancias con configuración
const manager = new SomeManager({
  callback: handleEvent,
  getData: () => globalState
});

// 2. Inicializar
manager.init();

// 3. Funciones delegadas
function legacyFunction() {
  manager.handleLegacyFunction();
}
```

### Testing

**Comandos**: `npm test` y `npm run test:coverage`

Los tests del renderer corren en JSDOM. Los del proceso principal declaran
`@jest-environment node` y restauran timers reales, porque el setup compartido
activa timers falsos y estos trabajan contra el sistema de archivos real.

**Organización**:

- `tests/unit/components/` — componentes y modales del renderer
- `tests/unit/core/`, `tests/unit/utils/` — clase base de modales, store, utilidades
- `tests/unit/main/` — proceso principal. Los handlers IPC se prueban capturando
  el handler desde un `ipcMain` mockeado y ejecutándolo contra una base de datos
  y archivos reales en un directorio temporal

**Cobertura**: los umbrales de `jest.config.cjs` son un trinquete contra
regresiones, no un objetivo; se fijaron algo por debajo de lo medido. Hay un
suelo propio para `src/main/`, que antes no se medía en absoluto.

Áreas prioritarias sin cubrir: `menuBuilder.js`, los gestores de ventana,
`imageManager.js`, y en el renderer `PhotoRosterExportManager` y varios modales.

### Beneficios de la Refactorización

1. **Mantenibilidad**: Código organizado en módulos cohesivos y especializados
2. **Testabilidad**: Cada componente es independiente y fácilmente testable
3. **Reutilización**: Componentes reutilizables (especialmente modales)
4. **Escalabilidad**: Fácil agregar nuevas funcionalidades sin inflar renderer.js
5. **Legibilidad**: Separación clara de responsabilidades
6. **Performance**: Virtual scrolling y lazy loading optimizan rendimiento
7. **Calidad**: la suite de tests protege los caminos donde un fallo no es visible

## Novedades de la Versión 1.3.x

### Nuevas Funcionalidades Implementadas

#### Cerrar Proyecto (v1.3.1)
- **Funcionalidad**: Permite cerrar el proyecto actual sin salir de la aplicación
- **Shortcut**: Ctrl+W
- **Comportamiento**:
  - Cierra la base de datos SQLite de forma limpia
  - Detiene el vigilante de carpetas (folderWatcher)
  - Limpia el estado del main process (projectPath)
  - Limpia el estado del renderer (usuarios, grupos, imágenes)
  - Actualiza el título de ventana a "Edu User Capture v{version}"
  - Oculta la barra de estado
  - Muestra placeholder de "sin proyecto"

#### Exportación de Orlas PDF (v1.3.0)
- **Funcionalidad**: Genera PDFs con fotos en formato orla (class photos)
- **Características**:
  - Un PDF por grupo
  - Layout en grid de 4 columnas
  - Formato A4 portrait
  - Nombre completo debajo de cada foto
  - Selección de fuente: fotos capturadas o del repositorio
  - Calidad de imagen configurable (0-100)
  - Placeholder para usuarios sin foto

#### Exportación de CSV Inventario (v1.3.0)
- **Funcionalidad**: Exporta 3 archivos CSV separados por tipo de usuario
- **Archivos y cabeceras**: ver [Archivos para Edu Inventory Manager](#2-archivos-para-edu-inventory-manager),
  que es como se llama hoy en el menú
- **Uso**: Ideal para inventarios y reportes administrativos

#### Exportación de Imágenes por Nombre Completo (v1.3.0)
- **Funcionalidad**: Exporta imágenes con formato "Apellido1 Apellido2, Nombre.jpg"
- **Organización**: Carpetas por grupo
- **Opciones**: Copia original o redimensionamiento

#### Exportación de Inventario de Imágenes del Repositorio (v1.3.0)
- **Funcionalidad**: Exporta imágenes del repositorio (no capturadas)
- **Características**:
  - Soporte para ZIP con límite de tamaño configurable
  - División automática en múltiples ZIPs si excede el límite
  - Solo exporta usuarios que tienen imagen en el repositorio
  - Organización por grupos

#### Barra de Estado (v1.3.0)
- **Funcionalidad**: Muestra información del proyecto en tiempo real
- **Información mostrada**:
  - Nombre del proyecto
  - Ruta de la carpeta del depósito
  - Contador de usuarios totales
- **Visibilidad**: Se oculta automáticamente cuando no hay proyecto abierto

#### Placeholder "Sin Proyecto" (v1.3.0)
- **Funcionalidad**: Muestra un icono y el texto «Abre o crea un nuevo
  proyecto» cuando no hay ninguno abierto. No lleva botones: se crea o se abre
  desde el menú Archivo
- **Comportamiento**: Se oculta automáticamente al abrir/crear proyecto

#### Spinners de Carga (v1.3.0)
- **Funcionalidad**: Indicadores visuales de carga para operaciones largas
- **Ubicaciones**:
  - Lista de usuarios (carga inicial)
  - Indicadores de repositorio (durante sincronización)
  - Imágenes lazy-loaded
- **Duración mínima**: Configurada para evitar flashes visuales

#### Sistema de Petición de Carnets (v1.4.0)
- **Funcionalidad**: Sistema para solicitar la impresión de carnets de usuarios
- **Acceso**: menú contextual > "Solicitar impresión de carnet". Fuera del
  modo selección se pide para el usuario de la fila; en modo selección, para
  los marcados (`_appendRequestOptions()` de `SelectionModeManager`)
- **Características**:
  - Genera archivos con ID del usuario en carpeta `To-Print-ID` dentro del repositorio
  - Nombre de archivos: `{ID}` sin extensión (NIA para alumnos, DNI para personal)
  - Icono de "ID card" visible en la lista cuando existe archivo en `To-Print-ID`
  - Solo procesa usuarios que tienen imagen en el repositorio
  - Filtro en menú Ver > "Carnets solicitados"
  - El icono desaparece automáticamente cuando se elimina el archivo
  - **Marcado automático como impresos**: Al exportar CSV para carnets, si algún usuario exportado tiene solicitud pendiente, se pregunta al usuario si desea marcarlos como impresos (mueve archivos de `To-Print-ID` a `Printed-ID`)
- **Optimización**: Usa caché con TTL para minimizar operaciones de filesystem
- **Uso**: Ideal para gestionar impresión de carnets en lotes
- **Solicitudes que el proyecto no puede atender**: el depósito es compartido y
  pasa de un curso a otro, así que `To-Print-ID` y `To-Publish` guardan
  solicitudes de gente que no está en el proyecto. `get-card-print-requests` y
  `get-publication-requests` cachean el listado de la carpeta (identificador y
  fecha) y en cada llamada lo filtran con `projectRequests()`: devuelven solo
  los `userIds` del proyecto (NIA para alumnado, documento para el resto), y
  así el contador coincide con lo que enseña el filtro. **No se borra nada**:
  otro proyecto puede necesitarlas
  - `previousCourseIds`: las del proyecto hechas antes del 1 de septiembre de
    su curso, que se pintan en gris con trazo discontinuo. El curso sale de
    `<centro curso="2026">` (año en que empieza: 2026-2027), guardado en
    `project_settings` bajo `academicYear` al crear el proyecto y al aplicar
    una actualización del XML; sin él, el curso en marcha según la fecha
  - La fecha de una solicitud es `requestTime()`: la mayor entre modificación y
    creación. Pedir de nuevo la sella con `utimes` (`stampRequest()`), porque
    reescribir un archivo vacío no garantiza cambiarla y `copyFile` conserva la
    de la foto. El error posible solo hace pasar por actual una antigua
  - Actualizar el XML con uno de otro curso avisa en la confirmación: suele ser
    el XML del curso nuevo aplicado sobre el proyecto del anterior
  - **Proyecto > Revisar solicitudes pendientes** (`PendingRequestsModal`,
    `review-pending-requests`) lista las de fuera del proyecto y las del curso
    anterior, y archiva las marcadas (`archive-pending-requests`) moviéndolas a
    la subcarpeta `Archivadas` de su carpeta, que el listado ignora porque solo
    lee archivos. Nada se marca solo ni se borra. `archiveRequests()` solo
    acepta nombres de archivo sueltos de la carpeta de solicitudes
  - Todo esto vive en `pendingRequests.js`; `miscHandlers.js` solo lo llama

#### Sistema de Petición de Publicación Oficial (v1.4.0)
- **Funcionalidad**: Sistema para solicitar publicación oficial de fotografías
- **Acceso**: menú contextual > "Solicitar publicación oficial", para el
  usuario de la fila o, en modo selección, para los marcados
- **Características**:
  - Copia imágenes del repositorio a carpeta `To-Publish` dentro del repositorio
  - Nombre de archivos: `{ID}.jpg` (NIA para alumnos, DNI para personal)
  - Icono de "Upload" visible en la lista cuando existe imagen en `To-Publish`
  - Solo procesa usuarios que tienen imagen en el repositorio
  - Filtro en menú Ver > "Publicaciones solicitadas"
  - El icono desaparece automáticamente cuando se elimina la imagen
- **Optimización**: Usa caché con TTL para minimizar operaciones de filesystem
- **Uso**: Ideal para gestionar publicaciones oficiales (sistemas de gestión académica, etc.)

## Changelog Reciente

### 2025-01-30 - Mejora en Sistema de Petición de Carnets

**Marcado automático de carnets como impresos**:
- **Funcionalidad**: Al exportar CSV para carnets, la aplicación verifica si algún usuario exportado tiene solicitud de carnet pendiente en `To-Print-ID`
- **Flujo**:
  1. Usuario exporta CSV para carnets (Ctrl+E)
  2. Si algún usuario exportado tiene archivo en `To-Print-ID`, se muestra un modal de confirmación
  3. Si el usuario confirma, los archivos se mueven de `To-Print-ID` a `Printed-ID`
  4. Se muestra mensaje de confirmación con cantidad de archivos movidos
  5. Se refresca la lista de usuarios para actualizar indicadores visuales
- **Archivos modificados**:
  - `src/main/ipc/miscHandlers.js`: Agregados handlers `check-card-print-requests` y `mark-cards-as-printed`
  - `src/preload/preload.js`: Expuestos nuevos métodos IPC al renderer
  - `src/renderer/components/ExportManager.js`: Agregado método `checkAndMarkCardsAsPrinted()`
  - `src/renderer/renderer.js`: Pasado `confirmModal` a `ExportManager`
- **Beneficio**: Automatiza el flujo de trabajo de impresión de carnets, evitando tener que marcar manualmente los carnets como impresos

### 2025-01-29 - Fixes y limpieza de código

**Corrección de carga de repositorio al inicio**:
- **Problema**: Las imágenes del repositorio no se cargaban al arrancar con `npm run dev`, pero sí después de hacer Ctrl+R
- **Causa raíz**: Race condition - `ensureRepositoryMirrorStarted()` se llamaba en `createWindow()` antes de que el proyecto se abriera, por lo que `dbManager` era null y la función retornaba silenciosamente
- **Solución**: Mover la llamada a `ensureRepositoryMirrorStarted()` al final de `openRecentProject()` (después de que el proyecto se haya abierto exitosamente)
- **Archivos modificados**: `main.js` (líneas 303-313 eliminadas, líneas 651-655 agregadas)

**Eliminación de código muerto**:
- **Campo eliminado**: `has_external_image` en tabla `users` de SQLite
- **Función eliminada**: `markExternalImage(userId, exists)` en `database.js`
- **Razón**: El campo se definió en el schema pero nunca se utilizó en ninguna parte del código
- **Archivos modificados**: `src/main/database.js` (líneas 53 y 404-411)

**Corrección de tests**:
- **Tests corregidos**: 3 tests en `UserRowRenderer.test.js` que verificaban el CSS class `duplicate-image`
- **Problema**: Los tests verificaban el class en `.photo-indicator` pero en realidad se aplica a `.photo-indicator-wrapper`
- **Tests afectados**:
  - "should show duplicate indicator for duplicate images" (líneas 136-142)
  - "should not show duplicate indicator for unique images" (líneas 144-150)
  - "should apply imageCount to all rows" (líneas 288-303)
- **Resultado**: 488/488 tests pasando ✅

**Commits**:
- `c0bc3a9` - fix: ensure repository mirror starts after project opens
- `a5b9f6a` - refactor: remove unused has_external_image field and fix UserRowRenderer tests

## Estado Actual

**Versión**: la de `package.json`; este documento no la repite

Aplicación completamente funcional con todas las características principales implementadas:

- ✅ **Gestión de proyectos**: crear, abrir, cerrar, actualizar XML
- ✅ **Captura de imágenes**: desde webcam con previsualización
- ✅ **Importación automática**: desde carpeta ingest con vigilancia en tiempo real
- ✅ **Asociación de imágenes**: vincular imágenes a usuarios con confirmación
- ✅ **Depósito de imágenes**: una carpeta del disco, normalmente sincronizada
  con Google Drive para escritorio
- ✅ **Copia local**: sincronización automática del depósito en segundo plano
- ✅ **Exportaciones múltiples**:
  - CSV para carnets (formato completo)
  - Archivos para Edu Inventory Manager (3 CSV separados)
  - Imágenes por ID (NIA/DNI), capturadas o del depósito
  - Imágenes por nombre completo
  - Imágenes del depósito en ZIP
  - Listado en PDF con fotografías por grupo
  - Exportación de las fotos capturadas al depósito
- ✅ **Sistema de etiquetado**: tags personalizados para imágenes
- ✅ **Detección de duplicados**: identificación automática
- ✅ **Sistema de petición de carnets**: solicitar impresión de carnets con indicadores visuales
- ✅ **Sistema de petición de publicación**: solicitar publicación oficial con indicadores visuales
- ✅ **Múltiples ventanas**: principal, cámara, grids (capturadas y repositorio)
- ✅ **Filtros avanzados**: búsqueda (nombre, apellidos, NIA y documento, sin
  distinguir tildes), grupo, asignaciones duplicadas, carnets solicitados y
  publicaciones solicitadas
- ✅ **Optimizaciones**:
  - Caché de archivos con TTL
  - Virtual scrolling para listas grandes
  - Lazy loading de imágenes
  - Sincronización en background
- ✅ **Arquitectura modular**: main process y renderer process completamente refactorizados
- ✅ **Testing**: suite unitaria con Jest sobre renderer y proceso principal
- ✅ **Navegación por teclado**: accesibilidad mejorada
- ✅ **Gestión de estado**: store centralizado con sincronización
- ✅ **Menú completo**: shortcuts y organización por categorías

## Notas de Desarrollo

- **Seguridad**: Implementa `contextIsolation` y `nodeIntegration: false`
- **Comunicación IPC**: Separación clara entre main y renderer con preload
- **Arquitectura modular**: Código organizado por responsabilidad y funcionalidad
- **Caché optimizado**: Sistema de caché con TTL para reducir operaciones de filesystem
- **Sincronización**: copia local de la carpeta del depósito con actualización automática
- **Privacidad**: Apropiado para entornos educativos
- **Testing**: Suite completa de tests unitarios con Jest (ver sección Testing)
- **Patrones**: IIFE, UMD exports, callback-based communication, delegation pattern

## Funcionalidades principales
- Captura de imágenes desde:
    - Cámara web integrada
    - Carpeta del sistema que el programa vigila (por eventos, no consultándola cada cierto tiempo)
- Asociación de imágenes a usuarios
- Importación de listado de usuarios y otra información desde archivo XML
- Importación de imágenes de los usuarios correspondientes a cursos anteriores desde el depósito (una carpeta compartida, ver más abajo).

## Stack tecnológico
- Electron
- Node.js para manejo de archivos
- Para el acceso a la cámara web utilizaremos electron.
- Parser XML fast-xml-parser

## Almacenamiento
- Imágenes: carpeta local del proyecto
- Datos de usuarios: SQLite
- Relación usuario-imagen: un usuario sólo se le puede asignar una imagen capturada
- Archivo base de datos: En la carpeta del proyecto en la subcarpeta 'data'.

## Estructura de usuarios (desde XML)
- El archivo XML está estructurado con distintos conjuntos de datos con las siguientes etiquetas: grupos, alumnos, no_docentes y docentes (estas etiquetas se deben utilizar literalmente. No se pueden traducir a otro idioma).
- Los campos necesarios de los grupos son: código y nombre
- Para el resto los campos son: nombre, apellido1, apellido2, fecha_nac y documento.
- En el caso de 'alumnos' también se extrae el grupo y el NIA.
- En el caso de docentes y no_docentes, se les asigna un grupo de Docentes y No Docentes.

## Flujo de trabajo
- Al crear un proyecto, el usuario debe indicar la carpeta de trabajo y el archivo XML.
- En dicha carpeta se creará una subcarpeta llamada 'ingest' y otra llamada 'imports'.
- La carpeta de entrada ('ingest') se puede redirigir por proyecto a otra carpeta desde Proyecto > Configurar carpeta de entrada.
- Al abrir el proyecto, se lee la carpeta del depósito para saber qué usuarios tienen foto y marcarlo en la lista con un símbolo. Mientras tanto se copian las imágenes a la copia local, en segundo plano.
- Al detectar una imagen nueva en la carpeta 'ingest' se moverá automáticamente a la carpeta 'imports'.
- Cuando se capture desde la webcam, la imagen se almacenará en la carpeta 'ingest'.
- Al pulsar sobre el botón 'Enlazar', se almacena la relación de la fotografía seleccionada con el usuario marcado en la lista.

## Convenciones
- El código fuente debe estar todo en inglés.
- La interfaz de usuario debe estar en español.
- El nombre de la imagen capturada debe ser YYYYMMDDHHMMSS y en el caso de que en el mismo segundo se capturen 2 imágenes, que se le añada un ordinal.

## Depósito de imágenes (antes «servidor externo»)
- Es **una carpeta del disco**, que se configura en Proyecto > Configurar
  depósito de imágenes. Lo habitual es que sea una carpeta sincronizada por
  Google Drive para escritorio, pero a la aplicación eso le da igual: no habla
  con ninguna API, solo lee y escribe archivos
- `repositoryMirror.js` mantiene una copia local para no depender de la
  velocidad de la unidad sincronizada
- El diseño original preveía varios protocolos con Google Drive API como
  primero; se resolvió con la carpeta, que funciona con cualquier servicio que
  sincronice archivos

## Formato de imágenes
- Formatos aceptados: JPG
- Resolución de captura desde webcam: 1280x720
- Tamaño máximo de archivo: 5MB

## Comportamiento adicional
- Carpeta de entrada: no se consulta cada cierto tiempo, se reacciona a los eventos del sistema de archivos (chokidar).
- Al asociar imagen a usuario que ya tiene una: pedir confirmación.
- Formatos de imagen aceptados desde carpeta externa: JPG

## Orla de graduación
Dos cosas distintas que se llamaban igual. **«Orla» es solo el servicio de
pago**: la orla de fin de estudios que el alumnado compra, de la que hoy se
registra el pago y se imprime el recibo, y que crecerá (orla en PSD, rama
`feat/orla-psd`). El PDF con las fotos de cada grupo para identificar a la
gente es el **listado con fotografías por grupo** (Exportación 6), y en el
código es `photoRoster`, nunca `orla`.

- **Menú Orla**, entre Ver y Ayuda: registrar el pago y imprimir el recibo del
  usuario seleccionado (los mismos manejadores que los botones), los dos
  listados de pagos y **Configuración de la orla...**, que abre Preferencias en
  la categoría **Orla de graduación** (`PreferencesModal.show(prefs, { category })`).
  Lo nuevo de la orla va aquí, no en Archivo > Exportar
- **Interruptor**: Preferencias > Orla de graduación > *Gestionar la orla de
  graduación*, en `config.json` bajo `orla.enabled` (`isOrlaServiceEnabled()`,
  activado si falta). Apagado: sin menú Orla, sin **Ver > Pagos de la orla**,
  sin panel ni iconos de pagado e impreso, sin las opciones de deshacer del
  botón derecho y sin arrancar el auxiliar de recibos. **No borra nada**
  - `save-preferences` avisa con `context.onOrlaServiceChanged` solo si
    cambia; `main.js` (`setOrlaEnabled()`) reconstruye el menú y manda
    `orla-service-changed` y el valor efectivo del panel
  - **Ver > Pagos de la orla** (antes *Acciones adicionales*) sigue siendo
    `showAdditionalActions`, que forma parte de los espacios de trabajo
    (Carnets lo activa); por eso no se quitó. Lo que llega al renderer es
    `additionalActionsShown()` = opción y servicio, así que el renderer no
    necesita saber del interruptor para el panel y los iconos; solo el menú
    del botón derecho lo consulta (`getOrlaEnabled` de `SelectionModeManager`)

## Impresión de recibos
- **Impresora recomendada**: Impresora térmica con ancho de rollo de 80mm
- **Configuración**: Orla > Configuración de la orla..., o Archivo >
  Preferencias... > Orla de graduación
- **Funcionalidades**:
  - Configuración de impresora térmica
  - Personalización del contenido del recibo (nombre del centro, precio, logotipo, texto del pie)
  - Impresión de recibo de prueba para verificar configuración
  - El recibo se imprime con el botón **Imp. Recibo**, no al marcar la orla
    como pagada
  - Los recibos incluyen nombre del usuario y grupo
- **Nota**: El diseño del recibo está optimizado para impresoras térmicas de 80mm de ancho
- **Cómo se imprime** (`print-orla-receipt` en `miscHandlers.js`): con el
  auxiliar de Windows `native/receipt-printer/ReceiptPrinter.exe`, que dibuja el
  recibo con GDI, el motor de texto de Windows. Chromium convertía la página en
  una imagen y en la Epson TM-T20II (203 ppp) el texto salía con los trazos
  deformados; GDI ajusta cada carácter a los puntos de la impresora, como hacía
  la aplicación antigua de ActionScript
  - `receiptPrinter.js` arranca el auxiliar una vez (a los 5 s de abrir la
    aplicación si hay impresora configurada, o con el primer recibo) y lo deja
    esperando; los trabajos van como una línea JSON por stdin, en ASCII puro, y
    las respuestas vuelven por stdout emparejadas por `id`
  - Si falla **la impresora**, se informa y no se reimprime: imprimir otra vez
    por otro camino podría sacar dos recibos. Si el que no se puede usar es **el
    auxiliar** (no compilado, no arranca, se cae o no contesta), se imprime por
    Chromium (`printReceiptWithChromium()`), como antes
  - La maquetación está en dos sitios que deben coincidir:
    `generateReceiptHTML()` (Chromium) y `Receipt.Draw()` en el auxiliar, que
    reproduce los tamaños, márgenes e interlineados del HTML
  - Detalles de GDI: `TextRenderer` calcula los tamaños como si el dispositivo
    fuera una pantalla de 96 ppp, así que las fuentes se escalan por los ppp de
    la impresora (sin eso, la letra salía a la mitad); el logotipo se pinta
    sobre fondo blanco antes de enviarlo, porque los controladores pueden
    descartar las imágenes con transparencia
  - Un trabajo con `previewFile` dibuja el recibo en un PNG a 203 ppp en lugar
    de imprimirlo: lo usan los tests (`receiptPrinterHelper.test.js`, que
    ejecuta el `.exe` real) y sirve para revisar la maquetación sin papel
  - Medido con la Epson el 2026-09-15, hasta que el trabajo sale hacia la
    impresora: 2,0–2,4 s con la versión anterior, 1,56–1,63 s con Chromium sin
    la espera fija de medio segundo que tenía, y ~1,0 s con el auxiliar
- **Con Chromium, la página debe medir 80 × 297 mm**, la del controlador de
  rollo. Una página a la medida del recibo se colocaba centrada en la del
  controlador y la impresora echaba papel en blanco antes del logotipo; el
  blanco de debajo ya lo recorta el controlador

## Exportación de datos

**Los PDF llevan la marca de tiempo en el nombre** (`stampedPdfName()` en
`exportHandlers.js`, `{base}_AAAAMMDDHHMMSS.pdf`) para no pisar un listado ya
entregado; los CSV y ZIP conservan su nombre fijo porque los leen otros
programas (`carnets.csv`, los de Edu Inventory Manager) y se sobrescriben.

Todas las exportaciones eligen su carpeta con `window.electronAPI.selectExportFolder()`
(handler `select-export-folder`), no con `showOpenDialog`: abre el diálogo en
la última carpeta a la que se exportó y guarda la nueva al elegirla. Una
exportación nueva debe usarlo también. En `renderer.js`, el `showOpenDialog`
que reciben `ExportManager`, `OrlaExportManager` y `PhotoRosterExportManager`
ya apunta a él.

### 1. CSV para carnets
- **Comando de menú**: Archivo > Exportar > Archivo CSV para Carnets del grupo seleccionado
- **Shortcut**: Ctrl+E
- **Solo los usuarios con foto en el depósito**: los demás se cuentan como
  ignorados en el resultado
- **Nombre del archivo**: carnets.csv
- **Campos**:
  - id: NIA para alumnos, DNI para docentes y no docentes
  - password: NIA para alumnos, DNI para docentes y no docentes
  - userlevel: Alumno para alumnos Profesor para el resto
  - nombre
  - apellido1
  - apellido2
  - apellidos: suma de apellido1 y apellido2
  - centro: siempre 1
  - foto: para alumnos NIA.jpg. Para el resto DNI.jpg
  - grupo: nombre largo del grupo (el código si no hay grupo con ese código)
  - direccion: no rellenar
  - telefono: no rellenar
  - departamento: siempre 1
  - DNI
  - edad: para alumnos mayor.jpg si es mayor de edad (18 años), si no menor.jpg. Para el resto profesor.jpg
  - fechaNacimiento
  - nombreApellidos: nombre + apellido1 + apellido2

### 2. Archivos para Edu Inventory Manager
- **Comando de menú**: Archivo > Exportar > Archivos para Edu Inventory Manager
- **Archivos generados** (las cabeceras son literales, las lee otro programa):
  - **Alumnado.csv**: `Codigo`, `Nombre`, `Apellido1`, `Apellido2`,
    `Fecha Nacimiento`, `Grupo`
  - **Personal.csv**: añade `Función`, `Teléfono 1`, `Teléfono 2` y `Email`
  - **Grupos.csv**: `CódigoGrupo` y nombre, con **todos** los grupos del
    proyecto, tengan usuarios o no

### 3. Imágenes capturadas como ID
- **Comando de menú**: Archivo > Exportar > Imágenes capturadas como ID
- **Formato**: `{NIA}.jpg` para alumnos, `{DNI}.jpg` para personal, **en una
  subcarpeta por código de grupo**
- **Opciones**: Copia original o redimensionamiento

### 3b. Imágenes del depósito como ID
- **Comando de menú**: Archivo > Exportar > Imágenes del depósito como ID
- **Fuente**: la foto de cada usuario en el depósito, no la capturada
- **Formato**: el mismo que Imágenes capturadas como ID (subcarpeta por código de grupo,
  `{NIA}.jpg` / `{DNI}.jpg`; un `.jpeg` del depósito sale como `.jpg`)
- **Opciones**: Copia original o redimensionamiento
- Quién tiene foto lo averigua el proceso principal leyendo el depósito
  (`count-repository-images` antes, para el resumen), así que no depende de
  las opciones del depósito del menú Ver ni de `has_repository_image`
- Lee de la copia local cuando tiene el mismo tamaño y fecha que el archivo del
  depósito (`repositoryImageSource()`); si no, del depósito
- Una lista vacía no exporta nada, como en el resto de exportaciones. Al
  acabar muestra un resumen (`ExportManager.summarizeImagesExport()`)
- Comparte con Imágenes capturadas como ID el bucle por grupos,
  `exportImagesByIdToGroupFolders()`, que ahora también cuenta los usuarios sin
  grupo en lugar de saltarlos sin más

### 4. Imágenes capturadas como nombre y apellidos
- **Comando de menú**: Archivo > Exportar > Imágenes capturadas como nombre y apellidos
- **Formato**: `Apellido1 Apellido2, Nombre.jpg`
- **Organización**: Carpetas por grupo
- **Opciones**: Copia original o redimensionamiento

### 5. Imágenes capturadas al depósito
- **Comando de menú**: Archivo > Exportar > Imágenes capturadas al depósito
- **Destino**: carpeta del depósito configurada en Proyecto > Configurar
  depósito de imágenes
- **Alcance**: lo pregunta `ExportManager.chooseExportScope()` antes de nada,
  con `ExportScopeModal`, y es común al CSV de carnets y a las cuatro
  exportaciones de fotos. `buildScopeOptions()` arma las opciones que en ese
  momento significan algo distinto —selección, lo que muestra la lista (con la
  etiqueta de lo que la filtra, `describeListLabel()`), el grupo entero y el
  proyecto entero—, **descartando las que abarcan a las mismas personas**
  (misma lista de ids). Si solo queda una, no se pregunta: sin selección ni
  filtros las cuatro son el mismo conjunto y el diálogo solo costaría un clic
  - Viene marcada `displayed`, que es lo que hacían todas antes de preguntar,
    así que quien pulse Continuar obtiene lo de siempre. Si esa opción no está
    (lista vacía bajo un filtro), se marca la primera: dejar nada marcado
    convertía Continuar en un Cancelar silencioso
  - Antes el alcance era implícito y tomaba `currentUsers` (grupo y búsqueda),
    así que con Ver > Carnets solicitados o Publicaciones solicitadas se
    exportaba gente que la pantalla no mostraba. `getUsersToExport()` conserva
    esa regla implícita como respaldo, pero los flujos usan `scope.users`
  - El CSV de inventario y el listado con fotografías no pasan por aquí: ya tenían su propio
    selector de ámbito en sus diálogos
- **Formato**: `{NIA}.jpg` para alumnado y `{documento}.jpg` para el resto,
  siempre `.jpg` y en la raíz del depósito, **sobrescribiendo** lo que hubiera
- **Opciones**: copia original o redimensionado (tamaño y peso máximo). El
  diálogo muestra antes un resumen de qué se va a exportar (grupo, selección,
  búsqueda o filtro de duplicados), cuántas imágenes se enviarán y cuántos
  usuarios del ámbito no tienen foto capturada
  - Lo construye `ExportManager.describeExportScope()` y lo pinta
    `ExportOptionsModal.show(summary)`; el modal es compartido, así que el
    resumen es opcional y se oculta si no se le pasa
- **Se descartan**: usuarios sin NIA/DNI y aquellos cuyo archivo de origen falta
- **Desvinculación posterior**: si se exportó al menos una imagen, se ofrece
  quitar la foto capturada de la ficha de **los usuarios exportados, y solo
  ellos**. No borra ningún archivo: las fotos siguen en `imports` y en el
  depósito. Antes se guarda una copia de seguridad de los enlaces de todo el
  proyecto, restaurable desde Proyecto > Restaurar enlaces de imágenes
  - `clearCapturedImages(userIds)` acepta la lista de usuarios; sin ella limpia
    el proyecto entero, que es de lo que depende la restauración de una copia

### 6. Listado en PDF con fotografías por grupo
- **Comando de menú**: Archivo > Exportar > Listado en PDF con fotografías por grupo
- **Qué es**: un documento administrativo para identificar a alumnado y
  profesorado. Hasta la 1.18 se llamaba «Orlas en PDF»; se renombró para
  dejar «orla» a la orla de graduación
- **Formato**: Un PDF por grupo, `Listado_fotos_{código}_{AAAAMMDDHHMMSS}.pdf`
  (la misma marca para todos los grupos de una exportación), todas las
  páginas A4 (`addPage()` de PDFKit sustituye las opciones del documento, así
  que hay que repetir `size` y `layout`)
- **Layout**: rejilla de 6 × 6 (36 fotos por página)
- **Contenido**: Foto + nombre completo debajo
- **Ámbito**: todos los grupos o uno solo, elegido en su propio diálogo
- **Fuente de fotos**: Seleccionable (capturadas o depósito)
- **Calidad**: 60, 80 (recomendada), 90 o 100

### 6b. Listados en PDF de usuarios sin foto
- **Comandos de menú**: Archivo > Exportar > Listado en PDF de usuarios sin
  foto en el depósito / sin foto capturada
- **Alcance**: `chooseExportScope()`, como las exportaciones de fotos
- **Quién falta**: en el depósito, `findUserRepositoryImage()` sobre el
  listado de la carpeta (lo mismo que las exportaciones); capturada, sin
  `image_path`. `ExportManager.exportMissingPhotosPDF(source)` lo comprueba
  antes de pedir carpeta (con `count-repository-images` para el depósito) y,
  si no falta nadie, avisa sin generar nada; el handler tampoco escribe el
  archivo en ese caso (`fileName: null`)
- **Formato**: `Usuarios_sin_foto_en_deposito_{marca}.pdf` /
  `Usuarios_sin_foto_capturada_{marca}.pdf`. Primera página con un resumen por grupo;
  después una página nueva por grupo con alguien pendiente (para entregar a
  cada tutor), personas por `compareUsersByName` con su NIA o documento. Se
  deja fuera `ELIMINADOS`, como en la ventana de Fotografías por grupo

### 6c. Estadísticas de fotografías por grupo en PDF
- **Comando de menú**: Archivo > Exportar > Estadísticas de fotografías por grupo en PDF
- **Alcance**: el proyecto entero, sin preguntar, como la ventana
- **Datos**: `getGroupPhotoCoverage()` dos veces, capturadas y depósito. Si el
  depósito no está configurado o no está disponible, sale solo con las
  capturadas y el PDF y el aviso final dicen por qué
- **Formato**: `Estadisticas_fotografias_por_grupo_{marca}.pdf`, tabla con barra de porcentaje en
  los colores de la ventana. `photoReports.js` importa las reglas de
  `renderer/group-coverage.js` (`coverageRatio`, `coveragePercent`,
  `heatHue`, `sortGroups`, `summarize`) para que papel y pantalla coincidan
- Los dos PDF comparten `ReportWriter`: logo del centro, nombre del proyecto
  arriba, tablas que siguen en otra página repitiendo la cabecera y pie con
  fecha de generación y «Página n de m» (`bufferPages`)

### 7. Inventario de imágenes del depósito
- **Ubicación**: parte de los archivos para Edu Inventory Manager
- **Formato**: `imagenes.zip`, **plano, sin carpetas por grupo**; si se pasa
  del límite de tamaño, se parte en `imagenes_2.zip`, `imagenes_3.zip`...
- **Contenido**: las fotos del depósito, nombradas por identificador
- **Opciones**: límite de tamaño por ZIP
## Manual de uso

El manual que consulta el usuario (**Ayuda > Manual de uso**, `F1`) vive en
`src/help/` y se empaqueta con la aplicación: cada versión instalada lleva el
manual que le corresponde.

- **Estructura**: `pages.json` fija las páginas y su orden (`id` y `title`); cada
  página es `src/help/{id}.md` y empieza con un único `#` igual a su `title`.
- **Conversión**: `helpContent.js` la hace en el proceso principal con
  `markdown-it` y `html: false`, así que el HTML escrito en las páginas se
  escapa en lugar de colarse. La ventana solo inserta el resultado.
- **Enlaces**: entre páginas se escriben `[texto](exportaciones.md#seccion)`.
  El ancla de un título es su texto sin tildes, en minúsculas, solo con letras,
  números y guiones (`slugify()`): "¿Qué pasa si falta?" →
  `que-pasa-si-falta`. Los enlaces web se abren en el navegador; ningún clic
  saca la ventana del manual.
- **Notas internas**: `<!-- REVISAR: ... -->` no se muestra ni se busca. Sirve
  para dejar dudas pendientes de confirmar.
- **Ayuda contextual**: cualquier ventana puede abrir el manual en una sección
  con `window.electronAPI.openHelp({ page, anchor })`.
- **Estilo**: tuteo, rutas de menú en negrita con los textos exactos del menú
  (**Proyecto > Configurar depósito de imágenes**), atajos y nombres de archivo
  en código, avisos como citas que empiezan por **Importante:** o **Consejo:**.
  Nada de nombres de archivos del código ni detalles internos.
- **Tests**: `tests/unit/main/helpContent.test.js` recorre el manual real y
  falla si una página del índice no tiene archivo (o al revés), si el título no
  coincide, si un título se repite en una página, si hay HTML o si algún enlace
  apunta a una página o sección que no existe. Renombrar un título obliga a
  corregir los enlaces que lo usan.

## Política de control de versiones
- Cada vez que una funcionalidad se de por comprobada y finalizada, se hará un commit en git con la descripción de la funcionalidad en inglés.
- Toda funcionalidad nueva o que cambie lo que ve el usuario actualiza el manual (`src/help/`) en el mismo commit.
- Los commits NO deben incluir referencias a Claude, herramientas de IA, o co-autoría con Claude.
- Formato de commits:
  - Usar conventional commits: `tipo: descripción breve`
  - Tipos: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`, etc.
  - Mensaje principal: descripción concisa en inglés
  - Cuerpo del commit (opcional): lista de cambios detallados con guiones
  - Ejemplo:
    ```
    feat: implement repository file cache and automatic change detection

    - Add repository folder watcher using chokidar to detect image additions, changes, and deletions
    - Implement file existence cache with 5-minute TTL to reduce filesystem operations
    - Add IPC event 'repository-changed' to notify renderer when repository contents change
    ```
- Es obligatorio preguntar si se deben ejecutar los test antes de hacer un commit (se pueden ejecutar solo los tests cercanos a los cambios realizados).

<!-- sistema-contexto: v2 -->
