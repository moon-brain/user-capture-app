# Repository Guidelines

## Project Structure & Module Organization
- Core entry: `main.js` (Electron main process)
- Source: `src/main` (IPC, DB, filesystem), `src/renderer` (UI), `src/preload` (bridges)
- Utilities: `src/main/utils`, menus/windows in `src/main/menu` and `src/main/window`
- Assets: `assets/icons/*`
- Samples: `ejemplos/*` (example XML/CSV)

## Build, Test, and Development Commands
- `npm start` — launch the app.
- `npm run dev` — launch with hot reload (`electron-reloader`).
- `npm run dist:win|dist:mac|dist:linux` — package installers via `electron-builder` (artifacts in `dist/`).
- `npm run clean` / `npm run install:clean` — remove `node_modules`, `dist`, `build` and reinstall.
- Releases: `npm run release[:minor|:major]` bumps, updates CHANGELOG, commits and tags with `commit-and-tag-version` (local only); `npm run release:publish` pushes with tags and publishes the Windows installer as a GitHub Release (needs `GH_TOKEN`). Full guide: `docs/ACTUALIZACIONES_Y_RELEASE_PLAN.md`.

## Coding Style & Naming Conventions
- JavaScript (CommonJS) with 2‑space indentation, single quotes, and semicolons.
- Filenames: lowerCamelCase for modules (e.g., `xmlParser.js`), directories kebab/lowercase.
- Functions/variables use `camelCase`; classes `PascalCase`.
- Prefer small modules under `src/main/*` and `src/renderer/*`. Place new IPC handlers in `src/main/ipc`, windows in `src/main/window`, utilities in `src/main/utils`.
- No linter configured; keep formatting consistent with existing files. Add JSDoc where helpful.

## Testing Guidelines
- No automated tests are configured yet. If adding tests:
  - Place unit tests under `src/**/__tests__` or `tests/` with `*.test.js`.
  - Prefer Jest for pure modules and an Electron-friendly runner for integration.
  - Add `"test": "jest"` in `package.json` and aim for coverage of IPC handlers and utilities.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). The changelog and the version bump are derived from these prefixes by `commit-and-tag-version`.
- Commits should be scoped when relevant (e.g., `feat(ipc): ...`).
- PRs: include clear description, linked issues, and screenshots/GIFs for UI changes. Note platform impacts (Windows/macOS/Linux) and native module considerations.

## Security & Configuration Tips
- Do not commit secrets. If using Google Drive (`src/main/googleDriveManager.js`), store credentials securely and ignore local config files.
- The only native module is `sharp`: N-API with prebuilt binaries, nothing is compiled for Electron. `electron-builder` still runs `install-app-deps` on its own before packaging. The database uses `node:sqlite`, built into Electron's Node.
