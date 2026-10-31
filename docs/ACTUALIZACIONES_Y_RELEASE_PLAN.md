# Comprobación de actualizaciones y nuevo flujo de release

**Estado**: ✅ Completo. La 1.7.0 (2026-09-13) fue la primera Release de GitHub pero **no arranca** (leía `build.publish` del `package.json` recortado); la **1.7.1** la corrige y es la primera publicada con el flujo completo de la sección 1 sin intervención manual. Las versiones instaladas avisan de las nuevas desde entonces (paso 6), y la fase 2 se comprobó de extremo a extremo el 2026-09-15: una 1.10.0 instalada, desde Ayuda > Buscar actualizaciones, descargó, instaló y relanzó la 1.10.1 (paso 7).
**Redactado**: 2026-09-13, tras la migración a Electron 44.
**Alcance**: (1) un flujo de publicación reproducible que deje cada versión
como Release de GitHub, y (2) que la aplicación instalada avise de que existe
una versión nueva y, en una segunda fase, la descargue e instale.

Este documento está escrito para leerse **meses después** de la última
release. La primera sección es la guía rápida de publicación; el resto explica
el porqué, el diseño del actualizador y cómo se llega desde el estado actual.

---

## 1. Guía rápida: publicar una versión

> Esto es lo que hay que hacer cada vez. Si es la primera vez tras leer este
> documento, antes hay que completar la sección 6 (transición).

### 1.1 Antes de empezar

| Requisito | Cómo comprobarlo |
|---|---|
| Node 22.12 o superior (lo exige `electron@44`) | `node --version` |
| Sesión de `gh` con permiso `repo` | `gh auth status` |
| En `main`, sin cambios pendientes, sincronizado con `origin` | `git status -sb` debe decir `## main...origin/main` sin `ahead`/`behind` |
| Tests en verde | `npm test` |
| La aplicación arranca y abre el proyecto reciente | `npm run dev`, **y ciérrala después**: abierta con `--dev` bloquea los `.asar` de `dist/` y el empaquetado falla con `EBUSY` (ver 1.8) |
| **La aplicación empaquetada arranca** | `npm run dist:unpacked` y abrir `dist\win-unpacked\Edu User Capture.exe`. Obligatorio: el `package.json` del asar no tiene `build`, `scripts` ni `devDependencies`, y la 1.7.0 se publicó sin arrancar por leer `build.publish` al iniciar. `npm run dev` no lo detecta |
| Los commits desde el último tag usan tipos convencionales | `git log $(git describe --tags --abbrev=0)..HEAD --oneline` |

Lo último importa más de lo que parece: el changelog y el número de versión
se calculan a partir de los prefijos `feat:`, `fix:`, `perf:`... Un commit mal
tipado sale mal en el changelog o no sale.

### 1.2 Ver qué versión saldría, sin tocar nada

```
npx commit-and-tag-version --dry-run
```

Imprime la versión que calcula y el fragmento de changelog. Reglas:

- Solo `fix:` y `perf:` desde el último tag → sube el **patch** (1.7.0 → 1.7.1).
- Algún `feat:` → sube el **minor** (1.7.0 → 1.8.0).
- Algún `BREAKING CHANGE` en el cuerpo de un commit → sube el **major**.

Si el resultado no es el deseado se fuerza con `--release-as minor`,
`--release-as major` o `--release-as 2.0.0`.

### 1.3 Crear la versión (local, reversible)

```
npm run release              # versión calculada de los commits
npm run release:minor        # o forzar minor
npm run release:major        # o forzar major
```

Esto, y nada más que esto:

1. Escribe la versión nueva en `package.json` y `package-lock.json`.
2. Añade la sección nueva a `CHANGELOG.md`.
3. Hace el commit `chore(release): X.Y.Z`.
4. Crea el tag `vX.Y.Z`.

Todavía no ha salido nada del equipo. Revisa `CHANGELOG.md`; si algo está
mal, se deshace con `git tag -d vX.Y.Z && git reset --hard HEAD~1` y se
vuelve a empezar.

### 1.4 Publicar (sube a GitHub, ya no es reversible sin dejar rastro)

```
$env:GH_TOKEN = gh auth token      # PowerShell; en bash: export GH_TOKEN=$(gh auth token)
npm run release:publish
```

`release:publish` hace, en este orden:

1. `git push --follow-tags origin main`: sube los commits **y el tag**. Sin
   el tag no hay Release y el actualizador no ve nada.
2. `node scripts/release-notes.mjs`: **crea la Release** `vX.Y.Z` en GitHub
   con la sección de `CHANGELOG.md` como notas (o actualiza las notas si ya
   existe). Se crea antes de empaquetar a propósito: electron-builder sube
   el instalador y los metadatos desde dos publicadores en paralelo, y si
   ninguno encuentra la Release los dos la crean, quedando **dos releases
   con el mismo tag** y los adjuntos repartidos. Pasó en la 1.7.0.
3. `electron-builder --win nsis --x64 --publish always`: genera el
   instalador en `dist/` y sube a esa Release los tres adjuntos: el
   instalador `.exe`, su `.blockmap` y `latest.yml`. Solo sube a una Release
   publicada hace menos de dos horas; el paso 2 acaba de crearla.

El token solo vive en esa variable de entorno de esa terminal. No se guarda en
ningún archivo del repositorio.

### 1.5 Comprobar que ha salido bien

```
gh release view vX.Y.Z
```

Debe mostrar la release como publicada (no *draft*) y con exactamente estos
tres adjuntos:

```
Edu-User-Capture-X.Y.Z-win-x64.exe
Edu-User-Capture-X.Y.Z-win-x64.exe.blockmap
latest.yml
```

Y esto es lo que consultará cada aplicación instalada:

```
curl -L https://github.com/moon-brain/user-capture-app/releases/latest/download/latest.yml
```

Tiene que responder con `version: X.Y.Z`. Si responde con la versión anterior
o con 404, la release está en borrador o le falta `latest.yml`.

Después, instalar `dist\Edu User Capture-X.Y.Z-win-x64.exe` en el equipo y
comprobar que Ayuda > Acerca de muestra la versión sin `-DEV`.

### 1.6 Notas de la versión en GitHub

Las pone el paso 2 de `release:publish` desde `CHANGELOG.md`, y son las que
muestra la ventana de actualización de la aplicación. Si hay que retocarlas
(por ejemplo para mencionar un cambio de Electron, que al ser `chore` no sale
en el changelog), edítalas en GitHub o vuelve a lanzar `npm run release:notes`
después de corregir `CHANGELOG.md`; el script actualiza las notas si la
Release ya existe. `npm run release:notes -- --dry-run` las muestra sin tocar
nada.

### 1.7 Si algo sale mal después de publicar

- **El instalador es defectuoso y ya está publicado**: no borres la release,
  publica un patch corregido (`fix:` + `npm run release` + `release:publish`).
  Las aplicaciones instaladas irán a la última.
- **Hay que retirarla de verdad** (por ejemplo se publicó desde una rama
  equivocada):
  ```
  gh release delete vX.Y.Z --yes
  git push origin :refs/tags/vX.Y.Z
  git tag -d vX.Y.Z
  git revert HEAD            # revierte el commit chore(release)
  git push origin main
  ```
  Con esto `releases/latest` vuelve a apuntar a la versión anterior.
- **El push funcionó pero electron-builder falló**: el tag ya está en
  GitHub. Arregla la causa y lanza solo la parte de empaquetado:
  `npx electron-builder --win nsis --x64 --publish always`. Vuelve a subir
  los adjuntos a la misma release.
- **Hay dos releases con el mismo tag** (`gh release view` muestra solo
  parte de los adjuntos, o `gh release edit` responde "tag_name already
  exists"). Es la carrera descrita en 1.4 y no debería repetirse con el paso
  2, pero si ocurre: lista las releases con
  `gh api repos/moon-brain/user-capture-app/releases --jq '.[] | {id, tag_name, assets: [.assets[].name]}'`,
  borra la que tenga menos adjuntos con
  `gh api -X DELETE repos/moon-brain/user-capture-app/releases/<id>` y sube a
  la que queda lo que le falte. El instalador se sube con el nombre **con
  guiones** que declara `latest.yml`, y `gh` usa el nombre del archivo:
  ```
  copy "dist\Edu User Capture-X.Y.Z-win-x64.exe" "%TEMP%\Edu-User-Capture-X.Y.Z-win-x64.exe"
  gh release upload vX.Y.Z "%TEMP%\Edu-User-Capture-X.Y.Z-win-x64.exe"
  ```
  No hace falta regenerar nada: el sha512 de `latest.yml` es el del archivo
  de `dist/`.

### 1.8 Errores conocidos y su causa

| Síntoma | Causa | Solución |
|---|---|---|
| `GitHub Personal Access Token is not set` | Falta `GH_TOKEN` en esa terminal | Sección 1.4 |
| `HttpError: 404` al subir | El token no tiene permiso `repo` o el repositorio cambió de nombre | `gh auth refresh -s repo`; revisar `build.publish` en `package.json` |
| La release existe pero `latest.yml` responde con la versión anterior | La release está en borrador | `gh release edit vX.Y.Z --draft=false` |
| `npm ci` falla con "lock file out of sync" | Se editó `package.json` a mano | `npm install` para regenerar el lock |
| `npx electron` falla con `ERR_REQUIRE_ESM` | Node anterior a 22.12 | Subir Node |
| El instalador se llama con espacios y en GitHub con guiones | Normal: electron-builder sustituye los espacios al subir. `latest.yml` ya usa los guiones | Nada. Si subes un archivo a mano, ponle el nombre con guiones |
| La versión en la aplicación acaba en `-DEV` | Hay commits después del último tag; solo pasa en un checkout de git | Nada; la instalada nunca lo muestra |
| `gh release view` muestra solo parte de los adjuntos, o `gh release edit` dice `tag_name already exists` | Dos releases para el mismo tag (carrera de electron-builder, sección 1.4) | Sección 1.7 |
| El changelog no tiene sección de rendimiento | Falta `.versionrc.json` (la herramienta oculta `perf` por defecto) | Está en el repositorio; no borrarlo |
| La aplicación instalada aparece en el Administrador de tareas pero no muestra ventana | Excepción dentro de `app.whenReady()` antes de `createWindow()` (en 1.7.0, leer `build.publish` del `package.json` recortado) | Lanzarla desde una consola con `ELECTRON_ENABLE_LOGGING=1` para ver la excepción; publicar un patch |
| En `dist\win-unpacked` la comprobación de actualizaciones dice "no such file or directory, open ...app-update.yml" | El target `dir` no escribe `app-update.yml`; solo lo hace el NSIS | Es normal en esa comprobación. Para probar el actualizador ahí, copiar el `app-update.yml` de `resources/` de una instalación y reiniciar la aplicación |
| El empaquetado falla con `EBUSY: resource busy or locked, unlink '...dist\win-unpacked\resources\app.asar'` (o `default_app.asar`, en `win-unpacked.tmp`), y al reintentar se bloquea otro `.asar` | Hay una `npm run dev` abierta. Con `--dev` la aplicación vigila la carpeta del proyecto para recargarse, y Electron trata los `.asar` como carpetas: abre los de `dist/` en cuanto aparecen y no los suelta. No es el antivirus. Pasó en la 1.22.0 | Cerrar la aplicación de desarrollo, borrar `dist\win-unpacked` y `dist\win-unpacked.tmp` y volver a lanzar. Si `release:publish` ya hizo el push, seguir el tercer caso de 1.7 |
| `releases/latest` apunta a una versión vieja | Se creó una Release para un tag antiguo: GitHub elige "latest" **por fecha de creación**, no por número | Borrarla con `gh api -X DELETE repos/moon-brain/user-capture-app/releases/<id>`. Nunca crear Releases de versiones ya pasadas; el script se niega |

---

## 2. Por qué GitHub Releases como servidor

- El repositorio es **público**. Los adjuntos de una Release se descargan sin
  autenticación, sin límite práctico, sin servidor que mantener.
- electron-builder 26 **ya genera** lo necesario: en cada `dist:win` escribe
  `latest.yml` (versión, tamaño, sha512 del instalador) y el `.blockmap`
  (descarga diferencial), y mete en el paquete `app-update.yml` con
  `provider: github` y `owner/repo` tomados del remoto. Es exactamente el
  formato que consume `electron-updater`.
- `electron-updater` es la pieza compañera de electron-builder, mantenida por
  el mismo proyecto. La 6.8.x acompaña a electron-builder 26.

Lo que **no** resuelve: si el repositorio pasara a privado, la aplicación
necesitaría un token para descargar, y eso no es aceptable en un instalador
distribuido. Entonces habría que servir `latest.yml` y el instalador desde un
sitio estático (un bucket, una carpeta pública en un servidor del centro).
`electron-updater` lo soporta con `provider: generic` y una URL, sin cambiar
nada más en la aplicación.

## 3. Estado de partida, comprobado

| | |
|---|---|
| Herramienta de versionado | `standard-version` 9.5.0, abandonada desde 2022 |
| Scripts | `release`, `release:minor`, `release:major`: bump + `dist:win`. Ninguno hace push |
| Tags en local | hasta `v1.6.0` |
| Tags en `origin` | hasta `v1.4.0`. **`v1.5.0` y `v1.6.0` nunca se subieron** |
| Releases en GitHub | ninguna |
| `build.publish` en `package.json` | no existe; electron-builder lo deduce del remoto |
| Commits desde `v1.6.0` | 46 (8 `feat`, 8 `fix`, 10 `perf`...): la próxima versión calculada es **1.7.0** |
| Código de actualización en la app | ninguno |
| Firma de código | no hay. SmartScreen avisa en el primer arranque |

Versión y `-DEV`: `src/main/utils/version.js` lee `package.json` y añade
`-DEV` si hay commits tras el último tag, solo cuando existe `.git`. La
aplicación instalada nunca lo muestra, y el actualizador debe comparar la
versión limpia.

## 4. Nuevo flujo de release

### 4.1 Cambios de herramienta

- **`standard-version` → `commit-and-tag-version`** (13.x). Es el fork que
  los propios autores recomiendan: misma línea de comandos, mismo formato de
  changelog, mismos `--release-as` y `--dry-run`. Lleva un `.versionrc.json`
  porque los valores por defecto de la herramienta **ocultan `perf`** (por eso
  el changelog de 1.6.0 no tiene sección de rendimiento): ahora se muestran
  `feat`, `fix`, `perf` y `revert`, y siguen ocultos `docs`, `chore`, `test`,
  `build`, `refactor`, `style` y `ci`.
- **`electron-updater`** como dependencia de producción (sección 5).
- **`build.publish`** explícito en `package.json`:
  ```json
  "publish": {
    "provider": "github",
    "owner": "moon-brain",
    "repo": "user-capture-app",
    "releaseType": "release"
  }
  ```
  `releaseType` importa: el valor por defecto de electron-builder es `draft`,
  y el actualizador **ignora los borradores**. Un borrador olvidado durante
  meses es una release que nadie recibe. Con `release` la publicación es
  inmediata y la verificación es la de la sección 1.5.
- **El repositorio pasó de `vicpiri` a `moon-brain`** después de la 1.24.0.
  Cada instalación lleva el propietario grabado en el `app-update.yml` de su
  carpeta, así que las instaladas con la 1.24.0 o antes siguen preguntando a
  `vicpiri/user-capture-app` y llegan por la redirección de GitHub hasta que
  se actualizan a una versión posterior. Mientras quede alguna, **no se puede
  crear un repositorio con ese nombre**: la redirección se perdería y esos
  equipos dejarían de recibir actualizaciones. `GITHUB_RELEASES_URL` en
  `main.js` debe coincidir con `build.publish`.

### 4.2 Scripts

```json
"release": "commit-and-tag-version",
"release:minor": "commit-and-tag-version --release-as minor",
"release:major": "commit-and-tag-version --release-as major",
"release:publish": "git push --follow-tags origin main && node scripts/release-notes.mjs && electron-builder --win nsis --x64 --publish always",
"release:notes": "node scripts/release-notes.mjs"
```

Se separa en dos pasos a propósito. `release` es local y se deshace con dos
comandos; `release:publish` sube commits, tag e instalador, y eso ya no se
deshace limpiamente. Entre uno y otro se revisa el changelog.

Los scripts `dist:*` se mantienen para generar instaladores sin publicar.

### 4.3 Documentación que hay que actualizar a la vez

- `CLAUDE.md`, sección "Versionado": describe el flujo antiguo y dice que
  `release` crea un patch, cosa que no es cierta ni hoy (el salto lo deciden
  los commits). Debe remitir a la sección 1 de este documento.
- `README.md`, scripts de versionado y distribución.
- `AGENTS.md`, línea de releases.

## 5. Diseño del actualizador en la aplicación

### 5.1 Fases

**Fase 1, avisar.** La aplicación comprueba si hay versión nueva y lo dice en
un modal con las notas de la versión y un botón que abre la página de la
Release en el navegador. La descarga y la instalación las hace la persona,
como hasta ahora. Es lo mínimo útil y no toca el ciclo de vida de la
aplicación.

**Fase 2, descargar e instalar.** Desde el mismo modal, "Descargar" baja el
instalador en segundo plano (diferencial gracias al `.blockmap`, así que
suele ser una fracción de los 129 MB), muestra progreso y termina con
"Reiniciar e instalar" o "Al cerrar la aplicación". La aplicación cierra el
proyecto, se cierra y lanza el instalador en silencio.

**Descarga diferencial.** No hay nada que configurar. `electron-updater`
compara el `.blockmap` de la versión instalada con el de la nueva (los dos
están en sus Releases) y descarga solo los bloques distintos, reconstruyendo
el instalador a partir de `installer.exe`, la copia que el instalador NSIS deja
de sí mismo en `%LOCALAPPDATA%\edu-user-capture-app-updater\`. Si falta algo,
descarga el instalador entero sin más; en desarrollo siempre pasa, porque no
hay `installer.exe`.

La fase 1 se puede publicar sola. La fase 2 reutiliza todo lo de la 1 y añade
dos eventos y un botón.

### 5.2 Proceso principal: `src/main/updateManager.js`

Envuelve `autoUpdater` de `electron-updater` y es el único sitio que lo toca.

- Configuración: `autoDownload = false` (siempre; descargar es decisión de la
  persona), `autoInstallOnAppQuit = false`, `allowPrerelease = false`,
  `logger` = el logger de la aplicación, para que todo quede en `app.log`.
- `checkForUpdates({ manual })`: si `!app.isPackaged` o la plataforma no es
  Windows, devuelve `{ skipped: true }` sin llamar a nada. En desarrollo no
  existe `app-update.yml` y `electron-updater` lanzaría error.
- Traduce los eventos de `autoUpdater` a un único mensaje IPC
  `update-status` hacia la ventana principal con un estado:
  `checking`, `available` (versión, fecha, notas, URL de la release),
  `not-available`, `downloading` (porcentaje, bytes, velocidad),
  `downloaded`, `error` (mensaje).
- Regla de silencio: una comprobación **automática** que falla (sin red,
  proxy del centro que bloquea GitHub, 404) solo se registra en el log. Una
  comprobación **manual** que falla se muestra, con el texto del error.
- **Tiempo de espera** (`checkTimeoutMs`, 60 s por defecto): red de seguridad,
  no el camino habitual. `electron-updater` contesta por eventos, y una
  comprobación que no recibiera ninguno dejaba `checking` puesto para el resto
  de la sesión: todas las siguientes, incluida la manual del menú, salían con
  `already-checking` y la opción del menú parecía muerta. Al vencer se abandona
  la comprobación con estado `error` y `timedOut: true`, siguiendo la misma
  regla de silencio. Lo verosímil que lo provoque es una conexión colgada tras
  el proxy de un centro.
- `downloadUpdate()` (fase 2) descarga la versión que encontró la última
  comprobación: `electron-updater` descarga lo que esa comprobación
  devolvió, así que sin una que haya encontrado versión contesta
  `download-error`. Emite `downloading` al empezar (0 %) y con cada
  `download-progress`, y `downloaded` o `download-error` al acabar. El error
  llega a la vez por el evento `error` y por la promesa; se notifica una sola
  vez. Mientras hay una descarga en marcha o terminada, una comprobación no
  consulta GitHub: devuelve el progreso o `downloaded`.
- `installUpdate()` (fase 2) llama a `autoUpdater.quitAndInstall(true, true)`:
  silencioso y relanza la aplicación. Con el NSIS actual (`oneClick: false`)
  el primer argumento es lo que evita que aparezca el asistente. Si el
  instalador no arranca, `electron-updater` lo avisa por `error` de forma
  síncrona y sale `install-error`.
- **Proyecto abierto al instalar.** Lo cierra el renderer antes de pedir la
  instalación, con el mismo cierre que Ctrl+W (base de datos, vigilantes,
  estado del renderer). Así, si la instalación fallara, los dos procesos
  quedan de acuerdo con el proyecto cerrado. `close-project` no lo quita de
  recientes, de modo que al relanzarse se vuelve a abrir solo.
- **Instalar al cerrar.** `electron-updater` registra su manejador de
  instalación al salir cuando **termina** la descarga, y solo si
  `autoInstallOnAppQuit` ya está activo en ese momento: activarlo después no
  hace nada. Por eso `downloadUpdate()` lo activa al empezar la descarga (y lo
  desactiva si falla). Las dos opciones de la vista "descargada" acaban
  instalando, así que desde que la persona pide la descarga, cerrar la
  aplicación instala. "Al cerrar la aplicación" solo cierra el modal.

Persistencia en `config.json` (mediante `utils/config.js`), bajo una clave
`updates`:

```json
"updates": {
  "autoCheck": true,
  "lastCheck": "2026-09-13T08:00:00.000Z",
  "skippedVersion": "1.7.1"
}
```

### 5.3 Cuándo se comprueba

- **Al arrancar**, si `autoCheck` es verdadero y han pasado más de 24 horas
  desde `lastCheck`, con un retraso de unos 15 segundos tras `ready-to-show`
  de la ventana principal para no competir con la apertura del proyecto y la
  sincronización del depósito.
- **A mano**, desde Ayuda > "Buscar actualizaciones..." (`menuBuilder.js`,
  junto a "Acerca de"). Esta ignora `skippedVersion` y `lastCheck`.
- Una versión marcada con "Omitir esta versión" no vuelve a avisar hasta que
  salga otra distinta.

### 5.4 IPC y preload

Handlers nuevos, en un archivo propio `src/main/ipc/updateHandlers.js` para no
engordar `miscHandlers.js`:

| Canal | Sentido | Qué hace |
|---|---|---|
| `check-for-updates` | renderer → main | comprobación manual |
| `download-update` | renderer → main | fase 2 |
| `install-update` | renderer → main | fase 2 |
| `skip-update-version` | renderer → main | guarda `skippedVersion` |
| `open-release-page` | renderer → main | `shell.openExternal` a la URL de la release |
| `update-status` | main → renderer | estado, ver 5.2 |
| `menu-check-updates` | main → renderer | el menú pide abrir el modal en estado `checking` |

El preload expone `checkForUpdates`, `downloadUpdate`, `installUpdate`,
`skipUpdateVersion`, `openReleasePage` y `onUpdateStatus`.

### 5.5 Renderer: `components/modals/UpdateModal.js`

Extiende `BaseModal`, como el resto. Un solo modal con cuatro vistas según el
estado recibido:

- **Comprobando**: spinner. Solo en comprobación manual.
- **Disponible**: "Hay una versión nueva: X.Y.Z (tienes la A.B.C)", fecha,
  notas de la release (el cuerpo de la Release de GitHub, que `release:notes`
  rellena desde el changelog; si está vacío, un enlace al changelog). Botones:
  fase 1 "Abrir página de descarga"; fase 2 "Descargar". Siempre "Más tarde" y
  "Omitir esta versión".
- **Descargando** (fase 2): barra de progreso con porcentaje, MB y velocidad.
  "Seguir en segundo plano" (o Esc) cierra el modal; el progreso no lo vuelve
  a abrir, el final de la descarga sí.
- **Descargada** (fase 2): "Reiniciar e instalar" y "Al cerrar la aplicación"
  (Esc). Se abre sola al terminar la descarga, así que `Intro` no pulsa
  "Reiniciar e instalar": en plena sesión de fotos se enlaza con `Intro`, y una
  pulsación a destiempo cerraría la aplicación. Con una tarea en marcha
  (`ProgressManager.isShowing()`) el botón no reinicia y explica por qué, en
  lugar de estar deshabilitado sin más.
- **Error de descarga o de instalación** (fase 2): el motivo y "Abrir página
  de descarga" como salida.
- **Sin novedades** y **Error**: texto y "Cerrar". Solo en manual.

**Las notas llegan en HTML, no en markdown.** El cuerpo de la Release se
escribe como markdown desde `CHANGELOG.md`, pero el proveedor de GitHub de
`electron-updater` lee el feed `releases.atom`, cuyo `<content type="html">`
trae el cuerpo **ya renderizado**. La 1.7.2 mostraba `<h3>Bug Fixes</h3><ul>…`
tal cual porque el limpiador solo entendía markdown. `_cleanNotes()` convierte
ahora las etiquetas a texto —viñetas para los `<li>`, línea en blanco tras
títulos y párrafos, se conserva el texto de los enlaces y se descarta la
dirección— en lugar de inyectarlas con `innerHTML`: son contenido que viene de
la red, y ningún formato compensa meter marcado remoto en la ventana.

Ayuda > Acerca de muestra además "Última comprobación: fecha" y un enlace
"Buscar ahora" que dispara la comprobación manual.

### 5.6 Pruebas en desarrollo

`electron-updater` no funciona con `npm run dev` porque falta
`app-update.yml`. Para probar contra las releases reales sin empaquetar:

1. Crear en la raíz un `dev-app-update.yml` (**en `.gitignore`**) con el mismo
   contenido que el que genera electron-builder:
   ```yaml
   provider: github
   owner: moon-brain
   repo: user-capture-app
   ```
2. En `updateManager`, si `process.argv.includes('--dev-updates')` poner
   `autoUpdater.forceDevUpdateConfig = true` y saltarse la guarda de
   `isPackaged`.
3. Bajar temporalmente la versión de `package.json` (sin commit) para que la
   última release cuente como nueva.

**La build de `npm run dist:unpacked` no sirve para esto.** El destino `dir` de
electron-builder no escribe `app-update.yml`; solo lo genera el destino `nsis`.
Una comprobación desde ahí falla con `ENOENT ... app-update.yml`. Sirve para la
puerta de "la aplicación empaquetada arranca", que es para lo que está en la
sección 1.1, pero no para probar actualizaciones.

La prueba definitiva es con dos releases reales: instalar la N, publicar la
N+1 y ver que la N avisa (fase 1) o se actualiza sola (fase 2). Ojo con el
orden al verificar un arreglo del propio actualizador: para **ver** el arreglo
hace falta una instalada que ya lo lleve y una release posterior a ella, así
que lo que corrige la versión N solo se puede observar cuando salga la N+1.

### 5.7 Tests unitarios

- `tests/unit/main/updateManager.test.js`: mockear `electron-updater` con un
  `EventEmitter`; comprobar la traducción de eventos a `update-status`, la
  guarda de `isPackaged`, la regla de silencio automático/manual, la lógica de
  `lastCheck` y `skippedVersion`.
- `tests/unit/main/updateHandlers.test.js`: capturar los handlers desde el
  `ipcMain` mockeado, como los demás.
- `tests/unit/components/modals/UpdateModal.test.js`: todas las vistas, los
  callbacks de los botones y las teclas.

La descarga se probó en desarrollo contra la Release real: con
`--dev-updates`, un `updaterCacheDirName` propio en `dev-app-update.yml` para
no tocar la caché de la aplicación instalada, y la versión que ve
`electron-updater` bajada en memoria desde el inspector
(`autoUpdater.currentVersion`). **Antes de cerrar la aplicación hay que poner
`autoInstallOnAppQuit = false`**: si no, al cerrarla se instala en silencio la
versión descargada sobre la instalada.

### 5.8 Riesgos y decisiones

- **Instalador sin firma.** `electron-updater` solo verifica la firma del
  instalador descargado cuando la aplicación instalada está firmada; aquí no
  lo está, así que no verifica nada más allá del sha512 de `latest.yml`. Es el
  mismo nivel de confianza que descargar el instalador a mano de GitHub.
  Firmar el código queda fuera de alcance, como en la migración.
- **Redes de centro.** GitHub puede estar bloqueado. La comprobación
  automática nunca debe mostrar nada ni retrasar el arranque; por eso el
  retraso y la regla de silencio.
- **Solo Windows.** Solo se publican instaladores de Windows. En otras
  plataformas `checkForUpdates` devuelve `skipped`.
- **Proyecto abierto al instalar.** Un `quitAndInstall` a mitad de una
  exportación al depósito dejaría `.tmp` a medias. El botón "Reiniciar e
  instalar" debe estar deshabilitado mientras `ProgressManager` tenga una
  operación en curso.
- **`releases/latest` y prereleases.** GitHub excluye las prereleases de
  `latest`, y `allowPrerelease = false` las excluye también en el
  actualizador. Si algún día se quiere una beta, se publica marcada como
  prerelease y no llega a nadie por sorpresa.
- **Cambio de nombre de repositorio o de cuenta.** `app-update.yml` va dentro
  de cada instalador. Las versiones ya instaladas seguirían mirando al nombre
  antiguo; GitHub redirige los renombrados, pero no un cambio de cuenta. Si
  ocurriera, la última versión con el nombre antiguo tiene que ser una que
  ya apunte al nuevo.

## 6. Transición: de aquí al nuevo flujo

En orden, con un commit por paso. Los pasos 1 a 3 no tocan la aplicación.

1. **Subir los tags que faltan**: `git push origin --tags`. Sin esto los
   enlaces de comparación del changelog a `v1.5.0` y `v1.6.0` no resuelven.
2. **Cambiar la herramienta**: `npm uninstall standard-version && npm install
   -D commit-and-tag-version`. Scripts de la sección 4.2, `build.publish` de
   la 4.1, `scripts/release-notes.mjs`, y la documentación de la 4.3.
   Comprobar con `npx commit-and-tag-version --dry-run` que calcula 1.7.0 y
   que el fragmento de changelog es correcto.
3. **Ensayo de publicación sin release**: `npx electron-builder --win nsis
   --x64 --publish never` para confirmar que el `build.publish` explícito no
   cambia nada en `latest.yml` ni en `app-update.yml`.
4. **Fase 1 del actualizador** (secciones 5.2 a 5.5 sin descarga), con sus
   tests. Puerta: `npm run dev -- --dev-updates` con `dev-app-update.yml` y la
   versión bajada a mano debe mostrar el modal de "disponible" en cuanto
   exista la primera release; hasta entonces, debe mostrar "sin novedades" en
   manual y nada en automático.
5. **Primera release con el flujo nuevo: 1.7.0.** ✅ Hecha el 2026-09-13.
   Sección 1 completa. Es la primera Release de GitHub del proyecto y la
   primera versión con actualizador. electron-builder creó dos releases
   para el tag y hubo que borrar una y subir el instalador a mano; desde
   entonces `release:publish` crea la Release antes de empaquetar (1.4). La
   impresión térmica sigue sin probar desde la migración de Electron.
6. **Verificar el actualizador de extremo a extremo**: con la 1.7.1
   instalada, publicar la siguiente versión y comprobar que la 1.7.1 avisa.
   (La 1.7.0 no sirve para esto: nunca llega a ejecutar el actualizador.)
   En la aplicación empaquetada de la 1.7.1 ya se comprobó que tanto la
   comprobación automática como la manual responden "Sin novedades" contra
   la Release real. ✅ Hecho: las versiones instaladas avisan de las
   siguientes (así se vio, en la 1.7.2, que las notas llegaban en HTML).
7. **Fase 2** (descarga e instalación), con sus tests. ✅ Implementada; la
   descarga, el progreso, el segundo plano y la vista "descargada" se
   comprobaron con una descarga real de la 1.9.0. ✅ Verificada de extremo a
   extremo el 2026-09-15: con la 1.10.0 instalada y la comprobación pedida
   desde Ayuda > Buscar actualizaciones, la 1.10.1 se descargó, se instaló y
   la aplicación volvió a abrirse ya actualizada.

## 7. Fuera de alcance

- **Firma de código.** Eliminaría el aviso de SmartScreen y permitiría a
  `electron-updater` verificar firmas. Requiere un certificado de pago o el
  programa de Azure Trusted Signing; es una decisión aparte.
- **Publicar desde GitHub Actions.** Quitaría la dependencia del equipo de
  desarrollo (Node, token, tiempo de empaquetado) y dejaría el proceso en un
  archivo del repositorio. Es el paso natural después de que el flujo local
  funcione dos o tres veces; el flujo de este documento está pensado para
  que ese cambio sea solo mover los mismos comandos a un workflow. Hoy la CI
  (`tests.yml`) solo comprueba, con permiso de solo lectura; el `release.yml`
  antiguo, que publicaba sin este flujo, se quitó el 2026-10-31.
- **Instaladores de macOS y Linux.** No se publican ni se prueban.

## 8. Referencias

| Qué | Dónde |
|---|---|
| Scripts de release y `build.publish` | `package.json` |
| Versión y sufijo `-DEV` | `src/main/utils/version.js` |
| Menú Ayuda | `src/main/menu/menuBuilder.js:463` |
| Configuración persistente | `src/main/utils/config.js` (`config.json` en `userData`) |
| Metadatos que ya genera electron-builder | `dist/latest.yml`, `dist/win-unpacked/resources/app-update.yml` |
| electron-updater | https://www.electron.build/auto-update |
| Publicación en GitHub con electron-builder | https://www.electron.build/configuration/publish#githuboptions |
| commit-and-tag-version | https://github.com/absolute-version/commit-and-tag-version |
