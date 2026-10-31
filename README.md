# Edu User Capture App

Aplicación de escritorio desarrollada con Electron para la captura y gestión de imágenes de usuarios en entornos educativos.

## Descripción

Edu User Capture App permite la captura, organización y exportación de fotografías de usuarios (estudiantes, docentes y personal no docente) en instituciones educativas. La aplicación facilita la importación de datos desde archivos XML y la gestión de imágenes asociadas a cada usuario.

## Características Principales

### Gestión de Usuarios
- Importación de usuarios desde archivo XML
- Soporte para estudiantes, docentes y personal no docente
- Organización por grupos
- Búsqueda y filtrado avanzado
- Detección de duplicados
- Actualización de datos desde XML

### Captura de Imágenes
- Captura directa desde cámara web (1280x720)
- Selección de cámara disponible
- Importación de imágenes desde carpeta externa
- Detección automática de nuevas imágenes
- Asociación de imágenes a usuarios

### Exportación
- Exportación de imágenes capturadas como ID (NIA/DNI)
- Exportación de imágenes del depósito como ID (NIA/DNI)
- Exportación de imágenes capturadas como nombre y apellidos
- Exportación a CSV para carnets
- Depósito de imágenes de usuario
- Procesamiento de imágenes (redimensionado y compresión)

### Funcionalidades Adicionales
- Sistema de etiquetado de imágenes
- Vista de cuadro de imágenes
- Depósito centralizado de imágenes
- Visualización configurable (mostrar/ocultar fotos capturadas o del depósito)
- Gestión de proyectos recientes
- Logs detallados de operaciones

### Impresión de Recibos
- **Impresora recomendada**: Impresora térmica con ancho de rollo de 80mm
- Configuración personalizable del recibo (nombre del centro, precio, logotipo, texto del pie)
- Impresión de recibo de prueba para verificar configuración
- Impresión automática tras marcar orla como pagada
- Los recibos incluyen nombre del usuario y grupo
- Diseño optimizado para impresoras térmicas de 80mm

## Requisitos

- Node.js 16 o superior
- npm 8 o superior
- Windows, macOS o Linux

### Requisitos adicionales para compilación en Windows

Para compilar la aplicación en Windows, se requiere configuración adicional:

1. **Python con setuptools**:
   - Instalar Python 3.11 o anterior (Python 3.12+ requiere configuración adicional)
   - Si usas Python 3.12+, instalar setuptools: `pip install setuptools`

2. **Modo Desarrollador de Windows** (recomendado):
   - Abre Configuración de Windows → Privacidad y seguridad → Para desarrolladores
   - Activa "Modo de desarrollador"
   - Esto permite crear enlaces simbólicos sin privilegios de administrador
   - Reinicia el equipo si es necesario

3. **Alternativa sin Modo Desarrollador**:
   - Ejecutar PowerShell o terminal como Administrador para compilar
   - Esto es necesario para que electron-builder pueda crear enlaces simbólicos

## Instalación

```bash
npm install
```

## Desarrollo

Iniciar la aplicación en modo normal:

```bash
npm start
```

Iniciar en modo desarrollo (con hot reload y DevTools):

```bash
npm run dev
```

Ejecutar suite de tests unitarios:

```bash
npm test
```

## Build

### Módulos nativos

El único módulo nativo es sharp, que es N-API e instala binarios precompilados, así que no hay que reconstruir nada para Electron antes de distribuir. La base de datos usa `node:sqlite`, que viene con Electron.

### Generar ejecutable

Para Windows:

```bash
# Instalador NSIS
npm run dist:win

# Versión portable (ejecutable único)
npm run dist:win:portable

# Versión ZIP (carpeta comprimida)
npm run dist:win:zip
```

Para macOS (DMG):

```bash
npm run dist:mac
```

Para Linux (AppImage):

```bash
npm run dist:linux
```

Los archivos generados se guardarán en la carpeta `dist/`.

**Nota sobre versiones portables**:
- `portable`: Genera un único archivo `.exe` que se auto-extrae (ideal para distribuir por USB)
- `zip`: Genera un archivo `.zip` con la aplicación desempaquetada (ideal para copiar en red)
- Ambas opciones **no requieren instalación** y evitan advertencias de SmartScreen más fácilmente

### Firma de código (Code Signing)

**Problema**: Windows Defender y SmartScreen pueden marcar la aplicación como software malicioso si no está firmada digitalmente.

**Soluciones**:

1. **Para distribución pública** (recomendado):
   - Obtener un certificado de firma de código (Code Signing Certificate)
   - Certificado EV: ~$300-400/año (reconocimiento inmediato)
   - Certificado OV: ~$100-200/año (requiere construcción de reputación)
   - Proveedores: DigiCert, Sectigo, SSL.com

2. **Para desarrollo/uso interno**:
   - Agregar excepción en Windows Defender en el equipo de destino
   - Distribuir por carpeta compartida en red (sin instalador NSIS)
   - Usar formato portable (sin instalador)
   - Documentar el proceso de instalación manual

**Configuración de firma** (una vez obtenido el certificado):

```json
"build": {
  "win": {
    "certificateFile": "path/to/certificate.pfx",
    "certificatePassword": "your-password",
    "signingHashAlgorithms": ["sha256"],
    "rfc3161TimeStampServer": "http://timestamp.digicert.com"
  }
}
```

**Instrucciones para usuarios** (aplicación sin firmar):
1. Al descargar, Windows SmartScreen puede mostrar advertencia
2. Click en "Más información" → "Ejecutar de todas formas"
3. Agregar excepción en Windows Defender si es necesario

## Estructura del Proyecto

```
user-capture-app/
├── src/
│   ├── main/                    # Proceso principal de Electron
│   │   ├── ipc/                 # Manejadores IPC por funcionalidad
│   │   │   ├── exportHandlers.js       # Exportación CSV e imágenes
│   │   │   ├── miscHandlers.js         # Diálogos, tags, utilidades
│   │   │   ├── projectHandlers.js      # Gestión de proyectos y XML
│   │   │   └── userGroupImageHandlers.js # CRUD usuarios/grupos/imágenes
│   │   ├── menu/                # Sistema de menús
│   │   │   └── menuBuilder.js          # Constructor de menús
│   │   ├── utils/               # Utilidades y helpers
│   │   │   ├── config.js               # Configuración y preferencias
│   │   │   ├── formatting.js           # Formateo de fechas y nombres
│   │   │   ├── recentProjects.js       # Proyectos recientes
│   │   │   └── repositoryCache.js      # Caché de archivos (TTL)
│   │   ├── window/              # Gestión de ventanas
│   │   │   ├── cameraWindow.js         # Ventana de captura
│   │   │   ├── imageGridWindow.js      # Grid de imágenes capturadas
│   │   │   ├── mainWindow.js           # Ventana principal
│   │   │   └── repositoryGridWindow.js # Grid del repositorio
│   │   ├── database.js          # Gestión de SQLite
│   │   ├── folderWatcher.js     # Vigilancia de carpetas ingest/imports
│   │   ├── googleDriveManager.js # Integración con Google Drive API
│   │   ├── imageManager.js      # Procesamiento de imágenes (Sharp)
│   │   ├── logger.js            # Sistema de logging
│   │   ├── repositoryMirror.js  # Mirror local del repositorio
│   │   └── xmlParser.js         # Parser de archivos XML
│   ├── renderer/          # Interfaz de usuario
│   │   ├── components/          # Componentes modulares de UI
│   │   │   ├── modals/          # Componentes de modales
│   │   │   │   ├── AddTagModal.js
│   │   │   │   ├── ConfirmModal.js
│   │   │   │   ├── ExportOptionsModal.js
│   │   │   │   ├── InfoModal.js
│   │   │   │   ├── NewProjectModal.js
│   │   │   │   └── UserImageModal.js
│   │   │   ├── DragDropManager.js       # Gestión de drag & drop
│   │   │   ├── ExportManager.js         # Coordinador de exportaciones
│   │   │   ├── ImageGridManager.js      # Gestión de grid de imágenes
│   │   │   ├── ImageTagsManager.js      # Gestión de etiquetas
│   │   │   ├── LazyImageManager.js      # Lazy loading de imágenes
│   │   │   ├── ProgressManager.js       # Gestión de modal de progreso
│   │   │   ├── SelectionModeManager.js  # Modo multi-selección
│   │   │   ├── UserRowRenderer.js       # Renderizado de filas
│   │   │   └── VirtualScrollManager.js  # Virtual scroll
│   │   ├── core/                # Módulos core del renderer
│   │   │   ├── BaseModal.js             # Clase base para modales
│   │   │   └── store.js                 # Estado global
│   │   ├── index.html     # Ventana principal
│   │   ├── renderer.js    # Lógica de UI principal (coordinador)
│   │   ├── styles.css     # Estilos globales
│   │   ├── camera.html    # Ventana de cámara
│   │   ├── camera.js      # Lógica de captura
│   │   ├── image-grid.html # Grid de imágenes capturadas
│   │   ├── image-grid.js  # Lógica del grid
│   │   ├── repository-grid.html # Grid del repositorio
│   │   └── repository-grid.js # Lógica del grid repositorio
│   └── preload/           # Scripts preload (puente seguro)
│       └── preload.js     # API expuesta al renderer
├── tests/                 # Tests unitarios (Jest)
│   └── unit/
│       ├── components/          # Tests de componentes del renderer
│       │   ├── modals/          # Tests de modales
│       │   └── ...              # Tests de managers
│       └── ...
├── assets/
│   └── icons/             # Iconos de la aplicación
├── main.js                # Punto de entrada principal
└── package.json           # Configuración y dependencias
```

## Estructura de Datos

### Archivo XML

El archivo XML debe contener las siguientes secciones:

- **grupos**: Grupos o clases (código y nombre)
- **alumnos**: Estudiantes (nombre, apellidos, fecha_nac, documento, NIA, grupo)
- **docentes**: Profesores (nombre, apellidos, fecha_nac, documento)
- **no_docentes**: Personal no docente (nombre, apellidos, fecha_nac, documento)

### Base de Datos

La aplicación utiliza SQLite para almacenar:
- Información de usuarios
- Grupos
- Asociaciones de imágenes
- Etiquetas de imágenes

La base de datos se almacena en `[proyecto]/data/users.db`

## Flujo de Trabajo

1. **Crear/Abrir Proyecto**: Seleccionar carpeta de trabajo e importar archivo XML
2. **Capturar Imágenes**: Desde cámara web o carpeta externa
3. **Asociar Imágenes**: Enlazar fotografías con usuarios
4. **Exportar**: Generar archivos CSV y exportar imágenes organizadas

### Carpetas del Proyecto

- `ingest/`: Carpeta temporal donde se guardan las capturas
- `imports/`: Carpeta donde se almacenan las imágenes importadas
- `data/`: Base de datos SQLite
- `repository-mirror/`: Mirror local del repositorio Google Drive

## Changelog

### 2025-01-29 - Fixes y Optimizaciones

**Corrección de carga de repositorio**: Solucionado problema donde las imágenes del repositorio no se cargaban al inicio (race condition en inicialización del repositoryMirror).

**Limpieza de código**: Eliminado campo `has_external_image` no utilizado de la base de datos y su función asociada `markExternalImage()`.

**Tests corregidos**: Corregidos 3 tests en UserRowRenderer relacionados con CSS class de indicadores de duplicados. Suite completa: 488/488 tests pasando ✅

## Arquitectura

### Arquitectura Modular del Proceso Principal

El proceso principal ha sido refactorizado en módulos especializados:

#### Manejadores IPC (`ipc/`)
- **exportHandlers**: Exportación de CSV e imágenes con opciones de procesamiento
- **miscHandlers**: Diálogos del sistema, etiquetas de imágenes y utilidades generales
- **projectHandlers**: Gestión completa de proyectos y actualización de XML
- **userGroupImageHandlers**: Operaciones CRUD sobre usuarios, grupos e imágenes

#### Gestión de Ventanas (`window/`)
- **mainWindow**: Ventana principal con gestión de usuarios e imágenes
- **cameraWindow**: Ventana de captura desde webcam con selección de dispositivo
- **imageGridWindow**: Visualización en cuadrícula de imágenes capturadas
- **repositoryGridWindow**: Visualización en cuadrícula del repositorio

#### Utilidades (`utils/`)
- **config**: Persistencia de configuración y preferencias de usuario
- **formatting**: Formateo de fechas (ISO a español) y nombres de archivo
- **recentProjects**: Gestión de lista de proyectos recientes
- **repositoryCache**: Caché con TTL (5 min) para verificación de existencia de archivos

#### Sistema de Menús (`menu/`)
- **menuBuilder**: Constructor centralizado del menú con gestión de estado y callbacks

#### Módulos Core
- **database**: Gestión completa de SQLite (usuarios, grupos, imágenes, tags)
- **folderWatcher**: Vigilancia de carpetas ingest/imports con chokidar
- **googleDriveManager**: Integración con Google Drive API v3
- **imageManager**: Procesamiento de imágenes con sharp (validación, redimensionamiento)
- **repositoryMirror**: Sincronización y mirror local del repositorio Google Drive
- **xmlParser**: Parseo de XML de usuarios con fast-xml-parser
- **logger**: Sistema de logging centralizado

### Características Técnicas

- **Comunicación IPC segura**: Separación clara entre procesos con preload
- **Caché optimizado**: Sistema de caché con TTL para reducir operaciones de filesystem
- **Sincronización automática**: Mirror local del repositorio Google Drive con detección de cambios
- **Arquitectura modular**: Código organizado por responsabilidad y funcionalidad
- **Seguridad**: Implementa `contextIsolation` y `nodeIntegration: false`

### Arquitectura del Renderer (Interfaz de Usuario)

El proceso de renderizado sigue una arquitectura modular basada en componentes:

#### Componentes Principales

**Modales (components/modals/)**
- Todos extienden `BaseModal` para comportamiento consistente
- Basados en Promises para flujos async/await limpios
- 6 modales especializados: NewProject, Confirm, Info, ExportOptions, AddTag, UserImage

**Managers (components/)**
- **ExportManager**: Coordinador de todas las exportaciones (CSV e imágenes)
- **ImageTagsManager**: Sistema completo de etiquetado de imágenes
- **SelectionModeManager**: Modo de selección múltiple de usuarios
- **DragDropManager**: Drag & drop de archivos de imagen
- **ProgressManager**: Gestión de modal de progreso con eventos IPC
- **LazyImageManager**: Lazy loading con IntersectionObserver API
- **ImageGridManager**: Grid de imágenes del usuario seleccionado
- **VirtualScrollManager**: Virtual scrolling para listas grandes
- **UserRowRenderer**: Renderizado optimizado de filas de usuarios

**Core (core/)**
- **BaseModal**: Clase base para todos los modales
- **store.js**: Estado global de la aplicación

**Coordinador (renderer.js)**
- Inicializa componentes con callbacks de comunicación
- Delega funcionalidad a componentes especializados
- Mantiene retrocompatibilidad con estado global
- Gestiona eventos IPC del main process

#### Principios de Diseño

- **Patrón IIFE**: Evita contaminación del scope global
- **UMD Exports**: Compatible con browser y Node.js (para tests)
- **Callback-based**: Comunicación entre componentes mediante callbacks
- **Delegation**: renderer.js delega a componentes especializados

#### Testing

- **488 tests unitarios** con Jest y JSDOM
- Cobertura completa de todos los componentes (20-37 tests por componente)
- Mocking de DOM, IPC (electronAPI), y APIs del browser
- Ejecución: `npm test`

#### Optimizaciones

- **Virtual Scrolling**: Manejo eficiente de miles de usuarios
- **Lazy Loading**: Carga diferida de imágenes con IntersectionObserver
- **Code Splitting**: Componentes modulares cargados en orden de dependencias

## Tecnologías

- **Electron 28**: Framework para aplicaciones de escritorio
- **Node.js**: Runtime de JavaScript
- **SQLite3**: Base de datos local
- **Sharp**: Procesamiento de imágenes
- **Chokidar**: Vigilancia de sistema de archivos
- **fast-xml-parser**: Parser XML
- **Google APIs**: Integración con Google Drive

## Scripts NPM

### Desarrollo
- `npm start` - Inicia la aplicación en modo producción
- `npm run dev` - Inicia la aplicación en modo desarrollo (con hot reload y DevTools)

### Distribución
- `npm run dist:win` - Crear instalador NSIS para Windows (x64)
- `npm run dist:win:portable` - Crear ejecutable portable auto-extraíble para Windows (x64)
- `npm run dist:win:zip` - Crear archivo ZIP con aplicación desempaquetada para Windows (x64)
- `npm run dist:mac` - Crear distribución DMG para macOS (x64)
- `npm run dist:linux` - Crear AppImage para Linux (x64)

### Limpieza
- `npm run clean` - Eliminar node_modules, dist y build completamente
- `npm run clean:dist` - Eliminar solo carpetas dist y build
- `npm run install:clean` - Limpieza completa y reinstalación limpia de dependencias (con npm ci)

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

## Formato de Imágenes

- **Formatos aceptados**: JPG/JPEG
- **Resolución de captura**: 1280x720
- **Tamaño máximo**: 5MB
- **Nombrado**: YYYYMMDDHHMMSS (timestamp)

## Exportación CSV

El archivo `carnets.csv` contiene los siguientes campos:
- id, password, userlevel, nombre, apellido1, apellido2
- apellidos, centro, foto, grupo, direccion, telefono
- departamento, DNI, edad, fechaNacimiento, nombreApellidos

## Configuración Global

La aplicación almacena configuración global en:
- Windows: `%APPDATA%/user-capture-app/`
- macOS: `~/Library/Application Support/user-capture-app/`
- Linux: `~/.config/user-capture-app/`

## Autor

Victor Pineda Ribes

## Licencia

Este proyecto está licenciado bajo la licencia Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).

Esto significa que puedes:
- ✅ Compartir: copiar y redistribuir el material en cualquier medio o formato
- ✅ Adaptar: remezclar, transformar y crear a partir del material

Bajo las siguientes condiciones:
- 📝 Atribución: Debes dar crédito apropiado, proporcionar un enlace a la licencia e indicar si se han realizado cambios
- 🚫 No Comercial: No puedes usar el material para fines comerciales

Para más información, consulta: https://creativecommons.org/licenses/by-nc/4.0/
