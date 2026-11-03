# Notas de trabajo

## Estado actual

- Versión **1.26.0** publicada el 2026-11-02 (exportación **Archivos para
  Inventario Legacy**, comprobada por el centro: los tres CSV se importaron
  bien). La 1.25.0 (2026-10-31) trajo el XML del centro compartido por la
  carpeta `Centro` del depósito y el aviso de uno más reciente.
- `main` está al día con el tag `v1.26.0`; sin fallos abiertos en
  `docs/FALLOS_PENDIENTES.md`.
- Desde el 2026-10-31 el flujo es rama + pull request con «Rebase and merge»,
  CI en GitHub (tipos, Jest y prueba en Electron real) y hooks locales.
  `npm run release:publish` ya funciona solo con los tags antiguos (#14,
  primera ejecución real en la 1.26.0).
- Dos líneas de trabajo en ramas largas: orla en PSD (`feat/orla-psd`, solo el
  plan) y publicación en ITACA (`feat/publicacion-itaca`, solo local).

## Próximo paso

**Revisar los cinco pull requests de Dependabot** (#1–#4 y #6). Los de
`actions/checkout`, `actions/setup-node` y acorn deberían entrar sin más si la
CI pasa. **chokidar 6** es solo ESM y Jest 29 no puede cargarlo (como pasó con
archiver 8): no se acepta hasta pasar a Jest 30, que es justo el otro PR
(`jest-environment-jsdom` 30), así que van juntos y con calma. Después, ITACA.

## A medias / roto

- **Publicación en ITACA** (`feat/publicacion-itaca`, 3 commits: plan,
  prototipo con `playwright-core` y auditoría del CSV de carnets; 58 por
  detrás de `main`). Todo está ya commiteado en la rama, nada en `main` ni en
  el stash. **No se ha probado contra ITACA**: solo se puede desde la red del
  centro (`node scripts/itaca-prototype.mjs`, sin argumentos entra en modo
  descubrimiento) y hay que traer los `report.json`. La rama **no se sube**.
- **Orla en PSD** (`feat/orla-psd`, 1 commit con `docs/ORLA_PSD_PLAN.md`, 68
  por detrás de `main`): nada implementado; las rutas del plan deben pasar a
  **Orla > …** al rebasar.
- **Edu Inventory Manager frente a Legacy**: Legacy deja fuera al alumnado de
  baja, el grupo Eliminados y los grupos internos; Edu Inventory Manager no.
  El centro lo dejó así «de momento». Las dos exportaciones escriben
  `Personal.csv` y `Grupos.csv`: conviene exportarlas a carpetas distintas.
- **Aviso `DEP0190`** al publicar: `publish-release.mjs` usa
  `spawnSync(..., { shell: true })`. Inofensivo (argumentos fijos); arreglo
  pequeño opcional.
- **Sin lint** (typecheck sí). Recomendado: ESLint solo con errores reales,
  sin reglas de formato. Pendiente de decidir.
- **Documentación desfasada**: `AGENTS.md` dice que no hay tests; `README.md`
  pide Node 16 (hace falta ≥ 22.12).
- **Restos**: `src/renderer/_poc/` `[?]` si sigue haciendo falta; ramas
  remotas ya fusionadas (`feat/shared-xml-*`, `release/1.25.0`, `release/1.26.0`,
  `fix/*`) que se pueden borrar.

## Diario

### 2026-11-03

Sesión del 2026-10-31 al 2026-11-02. Revisión de arquitectura y puesta al día
de dependencias (sharp 0.35, pdfkit 0.20, fast-xml-parser 5, `node:sqlite` en
lugar de sqlite3, yazl en lugar de archiver), módulos frontera con
`// @ts-check` y tests de contrato, muestras de compatibilidad de la 1.6.0 y
la 1.24.1, CI, Dependabot y hooks. Publicadas la **1.25.0** (XML compartido en
`Centro/` y aviso de uno más reciente) y la **1.26.0** (exportación para
Inventario Legacy: tres CSV en Windows-1252 y CRLF con los datos que faltan
leídos del XML aplicado, sin cambiar el esquema; fotos en ZIP nombradas por
NIA o DNI). El centro confirmó que Inventario Legacy importa los archivos.
Borradas de la carpeta temporal las salidas de prueba y la copia de la base de
datos real.

### 2026-09-26

Montado el sistema de contexto para retomar el proyecto: secciones de entrada
al principio de `CLAUDE.md` (qué es, alcance, stack, comandos, mapa,
convenciones y decisiones), este `NOTES.md`, `ARCHITECTURE.md` con diagramas
Mermaid y los comandos `/abrir-sesion` y `/cerrar-sesion` en
`.claude/commands/`. Sin cambios en el código de la aplicación.
Averiguado: en ejecución se usa el Node 24.20 de Electron 44, y para
desarrollar hace falta Node ≥ 22.12. Aplazada la decisión sobre ESLint.
