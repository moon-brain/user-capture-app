# Notas de trabajo

## Estado actual

- Versión **1.19.0** publicada el 2026-09-25 (menú **Orla** con interruptor
  para apagar el servicio de orla; el antiguo «Orlas en PDF» pasa a ser el
  listado con fotografías por grupo).
- `main` está al día con el tag `v1.19.0`; sin fallos abiertos en
  `docs/FALLOS_PENDIENTES.md` ni en `TO-DO.md`.
- Dos líneas de trabajo abiertas en ramas: orla en PSD (`feat/orla-psd`, solo
  el plan) y publicación de fotos en ITACA (`feat/publicacion-itaca`, plan y
  prototipo de la fase 1 sin probar).

## Próximo paso

**Prioridad: terminar el prototipo de subida a ITACA.** Probarlo desde la red
del centro (`node scripts/itaca-prototype.mjs`; sin argumentos entra en modo
descubrimiento) y traer los `report.json` para completar los selectores. La
orla en PSD espera.

## A medias / roto

- **Publicación en ITACA** (`feat/publicacion-itaca`, 1 commit con el plan,
  8 por detrás de `main`): el prototipo de la fase 1
  (`scripts/itaca-prototype.mjs`, `itaca-prototype-electron.cjs`,
  `itaca-selectors.json`) está **sin commitear y en `main`**, no en la rama.
  La dependencia `playwright-core` está en `stash@{0}` de esa rama. No se ha
  ha probado con éxito contra ITACA; hay pruebas previstas en la red del
  centro el 2026-09-26.
- **Orla en PSD** (`feat/orla-psd`, 1 commit con `docs/ORLA_PSD_PLAN.md`, 18
  por detrás de `main`): nada implementado; las rutas de menú del plan deben
  pasar a **Orla > …** al rebasar.
- **CI**: `.github/workflows/tests.yml` comprueba tipos, tests y la prueba en
  Electron en cada push a `main` y en cada pull request; Dependabot propone las
  actualizaciones. Se sigue publicando desde local (el `release.yml` antiguo se
  quitó el 2026-10-31). Pendiente de que alguien active en GitHub las alertas
  de seguridad de Dependabot y mire la primera ejecución de la CI.
- **Sin lint** (typecheck sí, desde el 2026-10-31). Recomendado: ESLint solo con errores reales
  (variables sin definir o sin usar), sin reglas de formato. Pendiente de
  decidir; va después de ITACA.
- **Documentación desfasada**: `AGENTS.md` dice que no hay tests; `README.md`
  pide Node 16 y dice que el recibo se imprime al marcar la orla como pagada
  (ahora es con el botón **Imp. Recibo**).
- **Restos**: ramas `build/win` y `build02` (octubre de 2025, ya contenidas en
  `main`); un archivo `nul` en la raíz (ignorado en `.gitignore`); `src/renderer/_poc/`
  `[?]` si sigue haciendo falta.

## Diario

### 2026-09-26

Montado el sistema de contexto para retomar el proyecto: secciones de entrada
al principio de `CLAUDE.md` (qué es, alcance, stack, comandos, mapa,
convenciones y decisiones), este `NOTES.md`, `ARCHITECTURE.md` con diagramas
Mermaid y los comandos `/abrir-sesion` y `/cerrar-sesion` en
`.claude/commands/`. Sin cambios en el código de la aplicación.
Averiguado: en ejecución se usa el Node 24.20 de Electron 44, y para
desarrollar hace falta Node ≥ 22.12. Aplazada la decisión sobre ESLint.
