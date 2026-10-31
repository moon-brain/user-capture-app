/**
 * Builds a compatibility fixture with the code of a published version
 *
 *   node tests/fixtures/compat/generate.cjs <source tree> <output folder> [work folder]
 *
 * <source tree> is a checkout of the published tag (a `git worktree` of
 * v1.24.1, with a node_modules of the same sqlite3), not the current code:
 * the point is a project and a config.json as the installed version writes
 * them. Everything goes through that version's own IPC handlers and config
 * functions, as the window would call them. The few keys main.js writes
 * itself (camera, viewer mirror, thumbnail source) are written the way its
 * main.js does, since main.js cannot be loaded outside Electron.
 *
 * The project is created in [work folder] (D:\EduCapture-compat by default)
 * so the absolute paths it stores are neutral, and then copied to
 * <output folder>. Fixtures are generated once and never again; see README.md.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const [sourceArg, outputArg, workArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  console.error('Usage: node generate.cjs <source tree> <output folder> [work folder]');
  process.exit(1);
}
const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
const work = path.resolve(workArg || path.join(path.parse(process.cwd()).root, 'EduCapture-compat'));
const projectPath = path.join(work, 'Fotos curso 2025-26');
const userData = path.join(work, 'userData');

// --- Electron, as far as the handlers touch it -----------------------------

const handlers = new Map();
// Anything not listed is a function that does nothing, at any depth
const anything = () => new Proxy(function () {}, {
  get: (target, key) => (key === 'then' ? undefined : anything()),
  apply: () => undefined
});
const electron = new Proxy({
  ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), on: () => {} },
  app: {
    getPath: () => userData,
    getVersion: () => require(path.join(source, 'package.json')).version,
    isPackaged: false
  }
}, { get: (target, key) => (key in target ? target[key] : anything()) });

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electron;
  return originalLoad.call(this, request, ...rest);
};

const fromSource = (relative) => require(path.join(source, relative));
// Older versions lack whole modules and handlers: those steps are skipped
// and listed in generated.json, so the test knows what the fixture has
const skipped = [];
const optionalSource = (relative) => {
  if (fs.existsSync(path.join(source, `${relative}.js`))) return fromSource(relative);
  skipped.push(relative);
  return null;
};
const has = (channel) => handlers.has(channel) || (skipped.push(channel), false);
const call = (object, name, ...args) => {
  if (object && typeof object[name] === 'function') return object[name](...args);
  skipped.push(name);
  return undefined;
};
const invoke = async (channel, ...args) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler for ${channel}`);
  const result = await handler({ sender: null }, ...args);
  if (result && result.success === false && !result.imageAlreadyAssigned) {
    throw new Error(`${channel}: ${result.error || JSON.stringify(result)}`);
  }
  return result;
};

// --- What the school sends -------------------------------------------------

const xml = (students, groups) => `<?xml version="1.0" encoding="UTF-8"?>
<centro codigo="46000000" curso="2025">
  <grupos>
${groups.map(([code, name]) => `    <grupo codigo="${code}" nombre="${name}"/>`).join('\n')}
  </grupos>
  <alumnos>
${students.map((s) => `    <alumno nombre="${s[0]}" apellido1="${s[1]}" apellido2="${s[2]}" NIA="${s[3]}" grupo="${s[4]}" fecha_nac="${s[5]}" documento=""/>`).join('\n')}
  </alumnos>
  <docentes>
    <docente nombre="María José" apellido1="Ruiz" apellido2="Llorens" documento="12345678Z" fecha_nac="10/06/1975"/>
  </docentes>
  <no_docentes>
    <no_docente nombre="Pedro" apellido1="Gómez" apellido2="" documento="X1234567L" fecha_nac="22/01/1980"/>
  </no_docentes>
</centro>
`;

const BEGONA = ['Begoña', 'Núñez', 'Pérez', '10000001', '1ESOA', '14/02/2012'];
const ANA = ['Ana', 'Álvarez', 'Gil', '10000002', '2BACHA', '03/05/2007'];
const LUIS = ['Luis', 'Zapata', 'Ruiz', '10000003', '2BACHA', '20/11/2008'];
const INAKI = ['Iñaki', 'Sáez', 'Ortega', '10000004', '1ESOA', '01/09/2012'];
const MARTA = ['Marta', 'Ibáñez', '', '0012345', '1ESOA', '30/12/2011'];
const JOAN = ['Joan', 'Ferrer', 'Climent', '10000005', '2BACHA', '15/04/2008'];

const FIRST_XML = xml([BEGONA, ANA, LUIS, INAKI, MARTA], [['1ESOA', '1º ESO A'], ['2BACHA', '2º Bachillerato A']]);
// Iñaki leaves, Joan arrives, Begoña changes group and a group is renamed
const UPDATED_XML = xml(
  [[...BEGONA.slice(0, 4), '2BACHA', BEGONA[5]], ANA, LUIS, MARTA, JOAN],
  [['1ESOA', '1º ESO A (mañana)'], ['2BACHA', '2º Bachillerato A']]
);

async function main() {
  if (fs.existsSync(work)) throw new Error(`${work} already exists; remove it first`);
  if (fs.existsSync(output)) throw new Error(`${output} already exists; fixtures are never regenerated`);
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(path.join(work, 'XML'));
  fs.mkdirSync(userData);

  const xmlPath = path.join(work, 'XML', 'centro_2025.xml');
  const updatedXmlPath = path.join(work, 'XML', 'centro_2025_enero.xml');
  fs.writeFileSync(xmlPath, FIRST_XML, 'utf8');
  fs.writeFileSync(updatedXmlPath, UPDATED_XML, 'utf8');

  // --- The application, as main.js puts it together ---
  const DatabaseManager = fromSource('src/main/database');
  const config = fromSource('src/main/utils/config');
  const recent = fromSource('src/main/utils/recentProjects');
  const ingest = optionalSource('src/main/ingestFolder');
  const workspaces = optionalSource('src/main/workspaces');

  const logger = { info() {}, success() {}, warning() {}, error: console.error, section() {}, initialize() {}, close: async () => {} };
  const state = {
    dbManager: null, folderWatcher: null, imageManager: null, projectPath: null,
    availableCameras: [], selectedCameraId: null, incomingRotation: 0, webcamCaptures: new Set()
  };
  let recentProjects = recent.loadRecentProjects();

  const context = {
    mainWindow: () => null,
    logger,
    state,
    addRecentProject: (folder) => {
      recentProjects = recent.addRecentProject(folder, recentProjects);
      recent.saveRecentProjects(recentProjects);
    },
    updateWindowTitle: () => {},
    closeCurrentProject: async () => {
      if (state.folderWatcher) { await state.folderWatcher.stop(); state.folderWatcher = null; }
      state.incomingRotation = 0;
      if (state.dbManager) { await state.dbManager.close(); state.dbManager = null; }
      state.imageManager = null;
      state.projectPath = null;
    },
    ensureRepositoryMirrorStarted: () => {},
    groupCoverageWindow: () => null,
    imageGridWindow: () => null,
    repositoryGridWindow: () => null,
    repositoryMirror: () => null,
    repositoryCacheManager: { invalidateCache() {}, getCachedImages: () => null },
    createMenu: () => {},
    reinitializeRepositoryMirror: async () => {},
    // main.js's, word for word
    ensureDeletedGroup: async () => {
      const groups = await state.dbManager.getGroups();
      let deletedGroup = groups.find((g) => g.code === 'ELIMINADOS');
      if (!deletedGroup) {
        await state.dbManager.importUsers({ groups: [{ code: 'ELIMINADOS', name: '⚠ Eliminados' }], students: [], teachers: [], nonTeachingStaff: [] });
        deletedGroup = { code: 'ELIMINADOS', name: '⚠ Eliminados' };
      }
      return deletedGroup;
    },
    workspaceStore: workspaces && new workspaces.WorkspaceStore({ load: config.getWorkspaceSettings, save: config.saveWorkspaceSettings }),
    getCurrentView: () => ({
      showCapturedPhotos: true, showRepositoryPhotos: true, showRepositoryIndicators: false,
      showAdditionalActions: true, showCaptureHistory: true, showThumbnailGrid: false
    }),
    applyWorkspace: () => ({ success: true }),
    refreshWorkspaces: () => {},
    onOrlaServiceChanged: () => {}
  };

  fromSource('src/main/ipc/projectHandlers').registerProjectHandlers(context);
  fromSource('src/main/ipc/userGroupImageHandlers').registerUserGroupImageHandlers(context);
  fromSource('src/main/ipc/miscHandlers').registerMiscHandlers(context);
  const workspaceHandlers = optionalSource('src/main/ipc/workspaceHandlers');
  if (workspaceHandlers) workspaceHandlers.registerWorkspaceHandlers(context);

  // --- A school year's work ---
  await invoke('create-project', { folderPath: projectPath, xmlPath });
  const db = () => state.dbManager;
  const userId = async (nia) => (await db().getUserByNIA(nia)).id;

  // Photos as the folder watcher names them
  const sharp = require('sharp');
  const photo = (name, colour) => sharp({ create: { width: 120, height: 160, channels: 3, background: colour } })
    .jpeg({ quality: 70 }).toFile(path.join(projectPath, 'imports', name));
  const photos = ['20251014093001.jpg', '20251014093002.jpg', '20251014093003.jpg', '20251014093004.jpg', '20251014093005.jpg'];
  await Promise.all(photos.map((name, i) => photo(name, ['#c33', '#3a6', '#36c', '#cc3', '#888'][i])));
  const imported = (name) => path.join(projectPath, 'imports', name);

  await invoke('link-image-user', { userId: await userId(BEGONA[3]), imagePath: imported(photos[0]) });
  await invoke('link-image-user', { userId: await userId(ANA[3]), imagePath: imported(photos[1]) });
  // The same photo for two people, confirmed as the window does
  const shared = await invoke('link-image-user', { userId: await userId(LUIS[3]), imagePath: imported(photos[1]) });
  if (!shared.imageAlreadyAssigned) throw new Error('Expected the shared photo to ask first');
  await invoke('confirm-link-image', { userId: await userId(LUIS[3]), imagePath: imported(photos[1]) });
  await invoke('link-image-user', { userId: await userId(INAKI[3]), imagePath: imported(photos[2]) });
  const teacher = await db().getUserByDocument('12345678Z');
  await invoke('link-image-user', { userId: teacher.id, imagePath: imported(photos[3]) });
  // photos[4] stays in imports without anyone

  if (has('rotate-captured-image')) await invoke('rotate-captured-image', imported(photos[0]), 90);
  if (has('crop-captured-image')) await invoke('crop-captured-image', imported(photos[3]), { left: 10, top: 10, width: 90, height: 120 });

  await invoke('add-image-tag', { imagePath: imported(photos[0]), tag: 'repetir' });
  await invoke('add-image-tag', { imagePath: imported(photos[4]), tag: 'Ñandú borrosa' });

  await invoke('mark-orla-paid', await userId(ANA[3]), true);
  await invoke('mark-receipt-printed', await userId(ANA[3]), true);
  await invoke('mark-orla-paid', await userId(LUIS[3]), true);

  await invoke('backup-image-relationships');

  await config.setImageRepositoryPath(db(), 'G:\\Mi unidad\\Depósito fotos');
  await call(ingest, 'setConfiguredIngestPath', db(), 'E:\\Cámara\\entrada');
  await call(ingest, 'setIncomingRotation', db(), 270);

  // January: the school sends a new roll
  const analysis = await invoke('update-xml', updatedXmlPath);
  await invoke('confirm-update-xml', {
    groups: analysis.groups,
    newUsersMap: analysis.newUsersMap,
    deletedUsers: analysis.deletedUsers,
    currentUsers: analysis.currentUsers,
    xmlPath: analysis.xmlPath,
    academicYear: analysis.academicYear?.incoming ?? null
  });

  // --- Preferences, through the same calls as the windows ---
  await invoke('save-preferences', {
    centerName: 'IES Ejemplo', logoPath: 'G:\\Mi unidad\\logo.png',
    receiptSubtitle: 'Orla 2º Bachillerato', receiptPrice: '25', receiptFooter: 'Gracias',
    orlaEnabled: true, exportDefaults: { mode: 'resize', boxSize: 1200, maxSize: 300 }
  });
  await invoke('save-printer-config', { name: 'EPSON TM-T20II Receipt', displayName: 'EPSON TM-T20II Receipt' });
  await invoke('set-selected-group-filter', '2BACHA');
  if (has('create-workspace')) await invoke('create-workspace', 'Orla con historial');
  if (has('set-workspace-hidden')) await invoke('set-workspace-hidden', 'revision', true);
  // Each version keeps the keys it knows; the rest it leaves out
  config.saveDisplayPreferences({
    showDuplicatesOnly: false, showCardPrintRequestsOnly: false, showPublicationRequestsOnly: false,
    showCapturedPhotos: true, showRepositoryPhotos: true, showRepositoryIndicators: false,
    showAdditionalActions: true, showCaptureHistory: true, showThumbnailGrid: false, sortByLinkDate: true
  });
  call(config, 'saveUpdatePreferences', { autoCheck: false, lastCheck: '2026-10-20T08:00:00.000Z', skippedVersion: '1.24.0' });
  call(config, 'saveReplacedArchiveNotice', '2026-10-01T08:00:00.000Z');
  call(config, 'setLastExportFolder', 'G:\\Mi unidad\\Exportaciones');
  // What main.js writes itself, if that version's main.js writes it
  const mainSource = fs.readFileSync(path.join(source, 'main.js'), 'utf8');
  const mainKeys = config.loadGlobalConfig();
  const fromMain = {
    cameraAutoStart: true,
    viewerMirror: { bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, fullScreen: true },
    thumbnailGridSource: 'repository'
  };
  for (const [key, value] of Object.entries(fromMain)) {
    if (mainSource.includes(`config.${key} = `)) mainKeys[key] = value;
    else skipped.push(`main.js ${key}`);
  }
  config.saveGlobalConfig(mainKeys);

  await invoke('close-project');
  // Older versions did not wait for the watcher and the database to close.
  // Closed, SQLite folds the -wal file into the database and removes it: a
  // project left by the application has no -wal, so the copy waits for that
  await context.closeCurrentProject();
  const wal = path.join(projectPath, 'data', 'users.db-wal');
  for (let waited = 0; fs.existsSync(wal); waited += 100) {
    if (waited > 10000) throw new Error('The database did not close: users.db-wal is still there');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // --- Keep it ---
  fs.mkdirSync(output, { recursive: true });
  fs.cpSync(projectPath, path.join(output, 'project'), { recursive: true });
  fs.cpSync(userData, path.join(output, 'userData'), { recursive: true });
  fs.cpSync(path.join(work, 'XML'), path.join(output, 'XML'), { recursive: true });
  const version = require(path.join(source, 'package.json')).version;
  const generated = { version, generatedAt: new Date().toISOString(), projectPath, xmlPath, updatedXmlPath, skipped };
  fs.writeFileSync(path.join(output, 'generated.json'), JSON.stringify(generated, null, 2) + '\n');
  console.log(`Fixture written to ${output}`);
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
