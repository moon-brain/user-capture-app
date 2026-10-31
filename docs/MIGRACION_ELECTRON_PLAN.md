# Migración de Electron 28 a la línea con soporte

**Estado**: ✅ Migrado a Electron 44.3.0 y electron-builder 26.15.3, fusionado en `main`. Solo queda probar la impresión térmica (ver "Ejecución").
**Redactado**: 2026-09-13. **Revisado**: 2026-09-13, contrastando cada
afirmación con el código, `node_modules`, el registro de npm y la lista oficial
de cambios rompedores de Electron 29 a 44.
**Alcance**: dependencias, empaquetado y verificación, más **dos cambios de
código obligatorios** (ver "Cambios de código obligatorios"). No hay cambios de
funcionalidad visibles más allá de mantener lo que hoy funciona.

## Punto de partida, comprobado

| | |
|---|---|
| Electron instalado | **28.3.3** (`^28.0.0` en `package.json`) |
| Última estable | **44.3.0** (Chromium 152, Node 24.20; publicada el 8 de septiembre de 2026) |
| Líneas con soporte | 42, 43, 44 (Electron mantiene las tres últimas) |
| electron-builder instalado | **24.13.3** |
| Última de electron-builder | **26.15.3** |
| Tests | 1080 en 42 suites, todos en verde |

Electron 28 quedó fuera de soporte a mediados de 2024. Van dieciséis versiones
mayores de Chromium y varias de Node sin actualizar, sin parches de seguridad.

## Lo que parecía el problema y no lo es

Esto era lo que hacía temer la migración, y al mirarlo de cerca se cae:

**Los módulos nativos no hay que recompilarlos.** Los dos son N-API, y N-API es
estable a nivel de ABI entre versiones de Node y de Electron:

- `sqlite3@5.1.7` depende de `node-addon-api` y declara `"binary": {
  "napi_versions": [3, 6] }`. Su binario precompilado sirve para cualquier
  runtime que soporte N-API 6.
- `sharp@0.34.4` no compila nada: instala el paquete de plataforma
  `@img/sharp-win32-x64`, que trae `sharp-win32-x64.node` ya construido. Su
  `engines` (`^18.17 || ^20.3 || >=21`) lo satisface el Node 24 de Electron 44.

**Las APIs más habituales ya están migradas.** Comprobado en `main.js` y `src/`:

| Riesgo habitual | En este proyecto |
|---|---|
| `protocol.registerFileProtocol` / `interceptFileProtocol` (retiradas en 35) | No se usan; ya se migró a `protocol.handle` |
| `@electron/remote`, `enableRemoteModule` | No aparecen |
| `desktopCapturer` en el renderer | No se usa |
| `webContents.getPrinters()` (retirada en 31) | Ya se usa `getPrintersAsync()` |
| `clipboard` en el renderer (retirado en 44) | No se usa |
| `renderer-process-crashed`, `gpu-process-crashed` (retirados en 29) | No se usan |
| `session.setPreloads` (obsoleto en 35) | No se usa |
| `nodeIntegration`, `contextIsolation` | Ya en la configuración segura |
| Sandbox por defecto (desde Electron 20) | Ya vigente en 28, sin cambio |
| Windows 32 bits (dejado de publicar en 44) | Solo se genera x64 |

Pero **no es cierto que no se use ninguna API retirada**: la primera redacción
de este plan solo revisó el proceso principal, y en el renderer hay dos usos.
Son los que motivan la sección siguiente.

---

## Cambios de código obligatorios

### A. `File.path` en el drag & drop (retirado en Electron 32)

`src/renderer/components/DragDropManager.js:153` lee `file.path` de los
archivos soltados sobre la ventana para moverlos a `ingest`. Esa propiedad no
estándar desapareció en la 32: con la 44, `file.path` es `undefined` y el
drag & drop deja de funcionar **sin error visible**.

La sustitución oficial es `webUtils.getPathForFile(file)`, que solo existe en
el preload:

```javascript
// src/preload/preload.js
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  // ...
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
```

y en `DragDropManager` pedir la ruta a través de esa función antes de llamar a
`moveImageToIngest`. Los tests de
`tests/unit/components/DragDropManager.test.js:199-216` simulan archivos como
objetos con `path`; hay que adaptarlos al nuevo camino.

### B. `PrinterInfo` sin `isDefault` ni `status` (retirados en Electron 36)

Chromium eliminó ambos campos. `src/renderer/components/modals/PreferencesModal.js:376,380`
los muestra en la ficha de la impresora, así que con la 44 **todas** las
impresoras aparecerían como "No disponible" y "Predeterminada: No". Es
cosmético, pero confunde justo durante la puerta de impresión. Hay que quitar
esas dos filas (o mostrarlas solo si el campo existe) y limpiar el log de
`src/main/ipc/miscHandlers.js:906-907`, que también los registra.

---

## Los riesgos reales

### 1. `scripts/rebuild-native.mjs` — ya averiguado lo que hace

El script fuerza `npm rebuild --build-from-source` de `sqlite3` **y** de `sharp`
contra las cabeceras de Electron y después ejecuta `electron-builder
install-app-deps`. Inspeccionando `node_modules`:

- **sqlite3 se compila de verdad** con MSVC: en `node_modules/sqlite3/build/Release`
  quedan `node_sqlite3.iobj`, `.ipdb` y `.pdb` del 5 de noviembre de 2025.
- **El paso de sharp es un no-op.** `sharp/install/check.js` ve
  `npm_config_build_from_source`, busca `node-gyp` entre sus dependencias, no
  lo encuentra, escribe "Please add node-gyp to your dependencies" y sale con
  código 0. Nunca ha compilado nada; el temor al libvips del sistema no llega a
  materializarse.
- `install-app-deps` lo ejecuta electron-builder por su cuenta antes de
  empaquetar, así que el script lo duplica.

Conclusión: **eliminar el script y quitar `rebuild:native` de los `dist:*`** es
seguro. Y conviene hacerlo, porque desde Electron 33 los módulos nativos exigen
C++20 y el lock arrastra `node-gyp` 8.4.1: la compilación de sqlite3 es el
punto con más papeletas para romper, y no aporta nada frente al binario N-API.

Si al empaquetar con electron-builder 26 su `install-app-deps` intentara
compilar algo, `"npmRebuild": false` en `build` lo desactiva del todo. Con dos
módulos N-API no se pierde nada.

### 2. electron-builder 24 se queda corto

La 24.13.3 es de la época de Electron 28. Para una Electron moderna y las
herramientas de Windows actuales hay que subir a la 26.x. Sus cambios
rompedores (firma de Windows en `win.signtoolOptions`, notarización de mac,
`.desktop` de Linux como objeto) no afectan a esta configuración. Sí reescribió
la recolección de `node_modules`, y que `@img/sharp-win32-x64` acabe dentro del
paquete solo se confirma en la aplicación instalada.

Va en el mismo paso que Electron, no después: si algo falla en el empaquetado
hay que poder atribuir el fallo a uno de los dos, y por eso conviene verificar el
arranque en desarrollo **antes** de tocar el empaquetado (ver puertas).

### 3. `getUserMedia` desde `file://`

Las ventanas se cargan con `loadFile`, así que el origen es `file://`. La captura
depende de `navigator.mediaDevices.getUserMedia`, en `src/renderer/camera.js:65`
y `src/renderer/renderer.js:2074`.

Revisada la lista de cambios rompedores de la 29 a la 44, **ninguno toca el
contexto seguro de `file://` ni los permisos de medios de una ventana
principal**. El único relacionado (Permission Policy en la 30) afecta a iframes
de otro origen. No hay `setPermissionRequestHandler`, así que sigue el permiso
por defecto. El riesgo es menor de lo que parecía, pero es la funcionalidad
central, así que **hay que probarla en un equipo con cámara real**.

Si se rompiera, la salida conocida es servir el renderer por un esquema propio
registrado como `standard` y `secure`. El proyecto ya tiene esa maquinaria para
`app-img` (`src/main/protocol/imageProtocol.js`), pero es trabajo aparte.

### 4. Impresión silenciosa de recibos

`miscHandlers.js:1090` imprime con `webContents.print({ silent: true,
deviceName, printBackground: true })` a una impresora térmica de 80 mm. Nada en
la lista de cambios afecta a `print` con `silent` y `pageSize`, pero la pila de
impresión de Chromium ha cambiado varias veces por debajo. Hay que probarlo con
la impresora de verdad; un recibo en blanco o con otro tamaño no se detecta de
otra forma. (El cambio de `PrinterInfo` es aparte: ver cambio B.)

### 5. `asarUnpack` y las DLL de sharp

Hallazgo concreto: los binarios de sharp viven en

```
node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node   0,4 MB
node_modules/@img/sharp-win32-x64/lib/libvips-42.dll        18,1 MB
node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.17.2.dll 0,3 MB
```

Y `asarUnpack` en `package.json` dice:

```json
["**/*.node", "node_modules/sqlite3/**/*", "node_modules/sharp/**/*"]
```

El `.node` lo recoge el patrón `**/*.node`, pero **las dos DLL no encajan en
ninguna de las tres entradas**. Que hoy funcione está explicado:
electron-builder 24 desempaqueta por su cuenta cualquier módulo que contenga
`.dll` o `.node` (`app-builder-lib/out/asar/unpackDetector.js:23,75`). Es un
comportamiento interno del que no conviene depender al cambiar de versión
mayor: añadir `node_modules/@img/**/*` a `asarUnpack` es gratis, elimina la
duda y es lo que recomienda la propia documentación de sharp.

**Esto solo se ve en la aplicación instalada.** En `npm run dev` no hay asar.

### 6. `electron-reloader` (solo desarrollo)

`electron-reloader@1.2.3` no se toca desde 2022 y puede no llevarse bien con una
Electron moderna. Si falla, se pierde la recarga automática en `npm run dev`,
nada más. Se puede quitar sin consecuencias para producción.

Recordatorio: vigila la carpeta del proyecto, así que cualquier archivo que se
escriba dentro durante el desarrollo recarga el renderer y le vacía el estado.

### 7. Electron ya no se descarga en `postinstall` (desde la 42)

`npm install` deja el paquete sin binario; se descarga en la primera ejecución
de `electron .`. El primer `npm run dev` tras instalar necesita red y tarda más.
electron-builder descarga su propia copia para empaquetar, como hasta ahora.

### 8. El paquete `electron` 44 exige Node 22.12 o superior en el equipo

**Encontrado al ejecutar el plan.** `electron@44.3.0` declara `engines.node
>= 22.12.0`, y su descargador (`install.js`) hace `require('@electron/get')`
sobre la versión 5, que es solo ESM. Con Node 20.9, el instalado en el equipo
de desarrollo, falla con `ERR_REQUIRE_ESM` y `npx electron` no arranca:

```
Error: Electron failed to install correctly. Please delete `node_modules/electron`
and run "npx install-electron --no" manually.
```

No afecta a la aplicación instalada (lleva su propio Node), solo al equipo que
desarrolla y empaqueta. Hay que subir el Node del sistema a la LTS 22 o 24
antes del paso 3; no hay gestor de versiones instalado (ni nvm, ni fnm, ni
volta). Jest 29 y electron-builder 26 funcionan con ambas.

---

## Estrategia: salto directo

Dado que los módulos nativos no necesitan recompilarse y que los únicos usos de
APIs retiradas son los dos cambios de código ya localizados, **saltar
directamente a la 44.x** es defendible y evita repetir seis veces la misma
verificación. La alternativa (escalar por 31, 37 y 44) solo compensa si el
salto directo falla de forma que no se pueda atribuir.

Elegir 44 y no 42 da el mayor margen antes del próximo fin de soporte.

Todo en una rama desechable. Si a mitad se tuerce, se tira y se escala por
etapas, sin haber ensuciado `main`.

## Pasos

1. **Copiar fuera de `dist/` el instalador de 1.6.0** (y los anteriores si se
   quieren conservar). `dist/` está en `.gitignore` y `npm run clean` la borra
   entera; sin esta copia la vuelta atrás se queda sin instalador.
2. Rama nueva desde `main`.
3. Comprobar que el Node del equipo es 22.12 o superior (`node --version`);
   si no, subirlo (riesgo 8). Después, subir versiones **regenerando el lock**:
   ```
   npm install -D electron@^44 electron-builder@^26
   ```
   No sirve editar `package.json` y lanzar `npm ci`: `npm ci` aborta si el lock
   no coincide. Una vez actualizado el lock, `npm run install:clean` deja una
   instalación limpia; una parcial deja binarios de la versión anterior.
4. Aplicar los **cambios de código obligatorios** A y B, con sus tests.
5. Añadir `node_modules/@img/**/*` a `asarUnpack`.
6. Eliminar `scripts/rebuild-native.mjs`, los scripts `rebuild:native*` y su
   prefijo en los `dist:*` (riesgo 1).
7. Pasar las puertas de verificación en orden.
8. Un commit por cambio con sentido propio: dependencias, código, empaquetado,
   script de nativos. Así el `git bisect` sirve de algo si algo aparece semanas
   después.

## Puertas de verificación, en orden

El orden importa: cada puerta descarta una capa, y saltarse una hace que el
fallo de la siguiente sea imposible de atribuir.

1. **`npm test`** — 1080 tests hoy. No cargan Electron, lo mockean, así que
   deben pasar sin más cambios que los de `DragDropManager.test.js` (cambio A).
   Si fallan otros, el problema es de Node, no de Electron.
2. **`npm run dev` arranca** y abre el proyecto reciente: lista de usuarios,
   miniaturas por `app-img://`, barra de estado. **Arrastrar una foto** a la
   ventana y comprobar que llega a `ingest` (cambio A).
3. **Cámara**: abrir la ventana de captura en un equipo con webcam y capturar.
   Es el riesgo 3.
4. **Depósito**: sincronización del mirror, y una exportación completa contra
   `G:\Mi unidad\_Borrar` comprobando que se crea `Reemplazadas` y que no quedan
   `.tmp`. Ejercita sharp, el protocolo de imágenes y los renombrados sobre Drive.
5. **Impresión**: abrir Herramientas > Configurar impresora, comprobar que la
   lista de impresoras se ve bien (cambio B) e imprimir un recibo de prueba en
   la térmica. Es el riesgo 4.
6. **`npm run dist:win`** genera el instalador.
7. **Instalar el instalador y usar la aplicación instalada.** Innegociable: el
   asar, `asarUnpack` y los binarios nativos solo fallan aquí. Comprobar que
   `resources/app.asar.unpacked/node_modules/@img/` contiene las DLL, y repetir
   los puntos 2 a 5.

## Ejecución (2026-09-13)

Pasos 1 a 8 hechos, un commit por cambio. El equipo pasó de Node 20.9 a 24.19
por el riesgo 8. Resultado de las puertas:

| Puerta | Resultado |
|---|---|
| 1. `npm test` | ✅ 1081 tests, 42 suites, con Node 20 y con Node 24 |
| 2. `npm run dev` | ✅ Electron 44.3.0 / Chromium 152. Abre el proyecto reciente, 34 usuarios, 73 miniaturas por `app-img://` sin ninguna rota, barra de estado, mirror sincronizado, historial de capturas. `electron-reloader` sigue funcionando. Arrastre de una foto real desde el Explorador comprobado en la aplicación instalada |
| 3. Cámara | ✅ a nivel de API: desde `file://` (`isSecureContext` true) `getUserMedia` entrega la webcam integrada a 1280x720 y 30 fps con imagen real. Pedida sin dispositivo concreto eligió una cámara virtual NDI sin fuente y caducó, que no es cosa de Electron. Captura desde la ventana de cámara comprobada en la aplicación instalada |
| 4. Depósito | ✅ Exportación completa contra `G:Mi unidad_Borrar` desde la aplicación instalada |
| 5. Impresión | ⏳ **Pendiente**: recibo de prueba en la térmica. No estaba disponible al migrar; es lo único sin verificar y hay que hacerlo en cuanto se tenga a mano |
| 6. `npm run dist:win` | ✅ electron-builder 26.15.3. `@electron/rebuild` solo tocó sqlite3 y no compiló nada. Instalador de 129 MB en `dist/`. En `app.asar.unpacked` están `sharp-win32-x64.node`, las dos DLL de libvips y `node_sqlite3.node` |
| 7. Aplicación instalada | ✅ Instalada desde el instalador y repetidas las puertas 2 a 4 en ella (la 5 pendiente por la térmica) |

Comprobaciones hechas con el puerto de depuración de Chromium
(`--remote-debugging-port`) y un cliente CDP mínimo sin dependencias, que
evalúa en la ventana principal y captura pantalla.

## Vuelta atrás

`package-lock.json` en git y la rama sin fusionar bastan. Si el instalador
resulta defectuoso ya distribuido, se reinstala la versión anterior desde la
copia hecha en el paso 1; **no desde `dist/`**, porque `npm run clean` la habrá
borrado.

No hay migración de datos: ni el esquema de SQLite ni el formato del proyecto
cambian, así que un proyecto abierto con la versión nueva sigue abriéndose con la
vieja.

## Fuera de alcance

- **Servir el renderer por un esquema propio** en lugar de `file://`. Solo si el
  riesgo 3 se materializa.
- **Sustituir `electron-reloader`** por otra cosa. Si estorba, se quita.
- **Firma de código del instalador**. No se hace hoy y la migración no lo cambia.
- **Subir `sqlite3` (6.0.1) y `sharp` (0.35.4)**. Existen versiones nuevas, pero
  las actuales funcionan con Electron 44 y mezclar cambios impediría atribuir
  fallos. ✅ 2026-10-31: sharp subió a la 0.35.5; sqlite3 se sustituyó por
  `node:sqlite` porque se archivó en julio de 2026 (ver CLAUDE.md, «Decisiones»).

## Después de migrar

Se ha llegado a estar dieciséis versiones por detrás porque no hay ninguna señal
que avise. Electron mantiene solo las tres últimas mayores y publica una nueva
cada ocho semanas, así que **el soporte de una versión dura unos seis meses**.
Conviene subir una o dos veces al año, por ejemplo junto a la preparación de cada
curso, cuando ya se hacen pruebas completas. Desde una versión con soporte el
salto siempre es pequeño; el caro es este. Y en cada salto, revisar la lista de
cambios rompedores **también para el renderer**: `File.path` se escapó porque
solo se miró el proceso principal.

## Referencias de código

| Qué | Dónde |
|---|---|
| Versiones y empaquetado | `package.json` |
| Recompilado de nativos | `scripts/rebuild-native.mjs` |
| Recarga en desarrollo | `main.js:52-61` |
| Protocolo propio ya registrado | `src/main/protocol/imageProtocol.js` |
| `File.path` a sustituir (cambio A) | `src/renderer/components/DragDropManager.js:153`, `src/preload/preload.js` |
| Tests del drag & drop | `tests/unit/components/DragDropManager.test.js:199-216` |
| `PrinterInfo.isDefault` / `status` (cambio B) | `src/renderer/components/modals/PreferencesModal.js:376,380`, `src/main/ipc/miscHandlers.js:906-907` |
| Captura desde webcam | `src/renderer/camera.js:65`, `src/renderer/renderer.js:2074` |
| Impresión silenciosa | `src/main/ipc/miscHandlers.js:1070-1090` |
| Listado de impresoras | `src/main/ipc/miscHandlers.js:897` |
| Desempaquetado automático de DLL en electron-builder 24 | `node_modules/app-builder-lib/out/asar/unpackDetector.js:23,75` |
| No-op de sharp al compilar desde fuente | `node_modules/sharp/install/check.js` |
| Cambios rompedores de Electron | https://www.electronjs.org/docs/latest/breaking-changes |
