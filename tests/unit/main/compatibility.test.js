/**
 * Projects and config.json written by published versions still work
 *
 * Every installation updates itself and opens the projects and preferences
 * an older version left, and a project from a previous school year can be
 * opened at any time. The fixtures in tests/fixtures/compat/ were written by
 * the published code itself (generate.cjs, run on a worktree of each tag),
 * not by today's, so this checks what is really on the school's disks: the
 * current code opens them, reads every link, payment, tag, setting and backup
 * as that version left it, and an XML update keeps them.
 *
 * - v1.6.0: the version of the 2025-26 projects. No image_linked_at column,
 *   all-digit NIAs without their leading zeros, the receipt price as text,
 *   and none of the later settings.
 * - v1.24.1: the version every installation has today.
 *
 * The fixtures are never changed: each test works on a copy. A schema or key
 * change that breaks this has to be made backwards compatible, not the
 * fixture regenerated (see tests/fixtures/compat/README.md).
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockHandlers = new Map();
const mockPaths = { userData: null };
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockHandlers.set(channel, handler)),
    on: jest.fn()
  },
  app: { getPath: jest.fn(() => mockPaths.userData), getVersion: () => 'test', isPackaged: false },
  dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn(), showMessageBox: jest.fn() },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  shell: { openPath: jest.fn(), openExternal: jest.fn() }
}));

const { registerProjectHandlers } = require('../../../src/main/ipc/projectHandlers');
const { registerUserGroupImageHandlers } = require('../../../src/main/ipc/userGroupImageHandlers');
const { registerMiscHandlers } = require('../../../src/main/ipc/miscHandlers');
const config = require('../../../src/main/utils/config');
const recentProjects = require('../../../src/main/utils/recentProjects');
const ingestFolder = require('../../../src/main/ingestFolder');
const { WorkspaceStore } = require('../../../src/main/workspaces');

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures', 'compat');

// What each version left, where they differ
const VERSIONS = {
  'v1.6.0': {
    martaNia: '12345',
    hasLinkDates: false,
    settings: { ingestPath: null, incomingRotation: 0, academicYear: null, xmlFilePath: null },
    croppedOriginal: false,
    exportDefaults: { mode: 'copy', boxSize: 800, maxSize: 500 },
    updates: { autoCheck: true },
    replacedArchiveNotice: { lastNotice: null },
    customWorkspace: false,
    hiddenBuiltIn: false,
    savedConfig: { showAdditionalActions: true },
    fromMainJs: {}
  },
  'v1.24.1': {
    martaNia: '0012345',
    hasLinkDates: true,
    settings: { ingestPath: 'E:\\Cámara\\entrada', incomingRotation: 270, academicYear: '2025', xmlFilePath: /centro_2025_enero\.xml$/ },
    croppedOriginal: true,
    exportDefaults: { mode: 'resize', boxSize: 1200, maxSize: 300 },
    updates: { autoCheck: false, lastCheck: '2026-10-20T08:00:00.000Z', skippedVersion: '1.24.0' },
    replacedArchiveNotice: { lastNotice: '2026-10-01T08:00:00.000Z' },
    customWorkspace: true,
    hiddenBuiltIn: true,
    savedConfig: { showAdditionalActions: true, sortByLinkDate: true, showCaptureHistory: true },
    fromMainJs: {
      cameraAutoStart: true,
      viewerMirror: { bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, fullScreen: true },
      thumbnailGridSource: 'repository'
    }
  }
};

const logger = {
  info: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn(),
  section: jest.fn(), initialize: jest.fn(), close: jest.fn(async () => {})
};

const invoke = (channel, ...args) => mockHandlers.get(channel)({ sender: null }, ...args);

describe.each(Object.entries(VERSIONS))('project and config.json written by %s', (version, expected) => {
  const fixture = path.join(FIXTURES, version);
  const workRoot = path.join(os.tmpdir(), `edu-capture-compat-${version}-${process.pid}`);
  let testId = 0;
  let projectPath;
  let xmlFolder;
  let state;

  const ensureDeletedGroup = async () => {
    const groups = await state.dbManager.getGroups();
    const deleted = { code: 'ELIMINADOS', name: '⚠ Eliminados' };
    if (!groups.find((g) => g.code === deleted.code)) {
      await state.dbManager.importUsers({ groups: [deleted], students: [], teachers: [], nonTeachingStaff: [] });
    }
    return deleted;
  };

  const closeCurrentProject = async () => {
    if (state.folderWatcher) {
      await state.folderWatcher.stop();
      state.folderWatcher = null;
    }
    if (state.dbManager) {
      await state.dbManager.close();
      state.dbManager = null;
    }
    state.projectPath = null;
  };

  const users = async () => {
    const result = await invoke('get-users', {}, { loadRepositoryImages: false });
    expect(result.success).not.toBe(false);
    return Array.isArray(result) ? result : result.users;
  };
  const byId = (list) => Object.fromEntries(list.map((u) => [u.nia || u.document, u]));
  const photo = (name) => path.join(projectPath, 'imports', name);

  beforeAll(() => {
    // The folder watcher announces every start and stop
    jest.spyOn(console, 'log').mockImplementation(() => {});
    fs.rmSync(workRoot, { recursive: true, force: true });
    // Handlers are registered once per file: each describe registers its own
    // state, and the last one registered is the one invoked
    state = {
      dbManager: null, folderWatcher: null, imageManager: null, projectPath: null,
      incomingRotation: 0, webcamCaptures: new Set()
    };
    const context = {
      mainWindow: () => null,
      logger,
      state,
      addRecentProject: jest.fn(),
      updateWindowTitle: jest.fn(),
      closeCurrentProject,
      ensureRepositoryMirrorStarted: jest.fn(),
      ensureDeletedGroup,
      groupCoverageWindow: () => null,
      imageGridWindow: () => null,
      repositoryGridWindow: () => null,
      repositoryMirror: () => null,
      repositoryCacheManager: { invalidateCache: jest.fn() },
      createMenu: jest.fn(),
      reinitializeRepositoryMirror: jest.fn()
    };
    registerProjectHandlers(context);
    registerUserGroupImageHandlers(context);
    registerMiscHandlers(context);
  });

  beforeEach(async () => {
    jest.useRealTimers();
    testId++;
    const work = path.join(workRoot, String(testId));
    projectPath = path.join(work, 'Fotos curso 2025-26');
    xmlFolder = path.join(work, 'XML');
    fs.cpSync(path.join(fixture, 'project'), projectPath, { recursive: true });
    fs.cpSync(path.join(fixture, 'XML'), xmlFolder, { recursive: true });
    fs.cpSync(path.join(fixture, 'userData'), path.join(work, 'userData'), { recursive: true });
    mockPaths.userData = path.join(work, 'userData');

    const opened = await invoke('open-project', projectPath);
    expect(opened).toMatchObject({ success: true });
  });

  afterEach(async () => {
    await closeCurrentProject();
  });

  afterAll(() => {
    fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test('should list every user with the photo and payment they had', async () => {
    const list = byId(await users());

    expect(Object.keys(list).sort()).toEqual(
      [expected.martaNia, '10000001', '10000002', '10000003', '10000004', '10000005', '12345678Z', 'X1234567L'].sort()
    );
    expect(list['10000001']).toMatchObject({ first_name: 'Begoña', last_name1: 'Núñez', group_code: '2BACHA', image_path: photo('20251014093001.jpg') });
    // One photo for two people
    expect(list['10000002'].image_path).toBe(photo('20251014093002.jpg'));
    expect(list['10000003'].image_path).toBe(photo('20251014093002.jpg'));
    // Removed from the XML with a photo: kept under Eliminados
    expect(list['10000004']).toMatchObject({ group_code: 'ELIMINADOS', image_path: photo('20251014093003.jpg') });
    expect(list['12345678Z']).toMatchObject({ type: 'teacher', group_code: 'DOCENTES', image_path: photo('20251014093004.jpg') });
    expect(list['X1234567L']).toMatchObject({ type: 'non_teaching_staff', image_path: null });
    expect(list[expected.martaNia]).toMatchObject({ first_name: 'Marta', last_name1: 'Ibáñez', image_path: null });

    expect(list['10000002']).toMatchObject({ orla_paid: 1, receipt_printed: 1 });
    expect(list['10000003']).toMatchObject({ orla_paid: 1, receipt_printed: 0 });
    expect(list['10000001']).toMatchObject({ orla_paid: 0, receipt_printed: 0 });
  });

  test('should have the link date column, empty for links made before it', async () => {
    const list = byId(await users());

    // Opening an older project adds the column
    expect(list['10000005']).toHaveProperty('image_linked_at', null);
    if (expected.hasLinkDates) {
      expect(list['10000001'].image_linked_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    } else {
      expect(list['10000001'].image_linked_at).toBeNull();
    }
  });

  test('should keep the groups, including the ones the application adds', async () => {
    const groups = (await state.dbManager.getGroups()).map((g) => g.code).sort();

    expect(groups).toEqual(['1ESOA', '2BACHA', 'DOCENTES', 'ELIMINADOS', 'NO_DOCENTES', 'SIN_GRUPO']);
  });

  test('should read the project settings, with the defaults for those it lacks', async () => {
    const { settings } = expected;
    expect(await config.getImageRepositoryPath(state.dbManager)).toBe('G:\\Mi unidad\\Depósito fotos');
    expect(await ingestFolder.getConfiguredIngestPath(state.dbManager)).toBe(settings.ingestPath);
    expect(await ingestFolder.getIncomingRotation(state.dbManager)).toBe(settings.incomingRotation);
    expect(state.incomingRotation).toBe(settings.incomingRotation);
    expect(await state.dbManager.getProjectSetting('academicYear')).toBe(settings.academicYear);
    if (settings.xmlFilePath) {
      expect(await state.dbManager.getProjectSetting('xmlFilePath')).toMatch(settings.xmlFilePath);
    } else {
      expect(await state.dbManager.getProjectSetting('xmlFilePath')).toBeNull();
    }
  });

  test('should watch an ingest folder that exists', () => {
    // A configured E:\Cámara\entrada does not exist here, as with a
    // disconnected drive: the default one is watched instead
    expect(fs.existsSync(path.join(projectPath, 'ingest'))).toBe(true);
    expect(state.folderWatcher).toBeTruthy();
  });

  test('should keep the image tags', async () => {
    const result = await invoke('get-all-images-with-tags');

    const tags = Object.fromEntries(result.images.map((image) => [image.relativePath, image.tags.map((t) => t.tag)]));
    expect(tags).toEqual({ '20251014093001.jpg': ['repetir'], '20251014093005.jpg': ['Ñandú borrosa'] });
  });

  test('should find the original of a cropped photo', async () => {
    const result = await invoke('get-captured-image-crop-source', photo('20251014093004.jpg'));

    expect(result).toMatchObject({ success: true, hasOriginal: expected.croppedOriginal, width: 120, height: 160 });
    expect(result.sourcePath).toBe(expected.croppedOriginal
      ? path.join(projectPath, 'imports', 'Originales', '20251014093004.jpg')
      : photo('20251014093004.jpg'));
  });

  test('should restore the image links from the backup', async () => {
    const { backups } = await invoke('get-image-backups');
    expect(backups).toHaveLength(1);
    expect(backups[0].count).toBe(5);

    await invoke('clear-captured-images');
    expect((await users()).filter((u) => u.image_path)).toHaveLength(0);

    const restored = await invoke('restore-image-relationships', backups[0].backup_date);
    expect(restored).toMatchObject({ success: true });
    const list = byId(await users());
    expect(list['10000003'].image_path).toBe(photo('20251014093002.jpg'));
    expect(list['12345678Z'].image_path).toBe(photo('20251014093004.jpg'));
  });

  test('should keep links, payments and tags through an XML update', async () => {
    const marta = byId(await users())[expected.martaNia];

    // The roll from September again: Iñaki is back and Joan is not in it
    const analysis = await invoke('update-xml', path.join(xmlFolder, 'centro_2025.xml'));
    expect(analysis).toMatchObject({ success: true });
    const applied = await invoke('confirm-update-xml', {
      groups: analysis.groups,
      newUsersMap: analysis.newUsersMap,
      deletedUsers: analysis.deletedUsers,
      currentUsers: analysis.currentUsers,
      xmlPath: analysis.xmlPath,
      academicYear: analysis.academicYear?.incoming ?? null
    });
    expect(applied).toMatchObject({ success: true });

    const list = byId(await users());
    expect(list['10000001']).toMatchObject({ group_code: '1ESOA', image_path: photo('20251014093001.jpg') });
    expect(list['10000002']).toMatchObject({ image_path: photo('20251014093002.jpg'), orla_paid: 1, receipt_printed: 1 });
    expect(list['10000003']).toMatchObject({ image_path: photo('20251014093002.jpg'), orla_paid: 1 });
    expect(list['10000004']).toMatchObject({ group_code: '1ESOA', image_path: photo('20251014093003.jpg') });
    expect(list['12345678Z'].image_path).toBe(photo('20251014093004.jpg'));
    // The same person, now with the NIA as the XML writes it
    expect(list['0012345']).toMatchObject({ id: marta.id, first_name: 'Marta' });
    // No photo and no longer in the XML
    expect(list['10000005']).toBeUndefined();

    const tags = await invoke('get-all-images-with-tags');
    expect(tags.images.map((image) => image.relativePath).sort()).toEqual(['20251014093001.jpg', '20251014093005.jpg']);
  });

  test('should read every preference in config.json, with defaults for the missing ones', async () => {
    expect(config.getExportDefaults()).toEqual(expected.exportDefaults);
    expect(config.getUpdatePreferences()).toMatchObject(expected.updates);
    expect(config.isOrlaServiceEnabled()).toBe(true);
    expect(config.getSelectedGroupFilter()).toBe('2BACHA');
    expect(config.getReplacedArchiveNotice()).toEqual(expected.replacedArchiveNotice);
    expect(() => config.getLastExportFolder()).not.toThrow();

    const preferences = await invoke('get-preferences');
    expect(preferences).toMatchObject({
      success: true,
      preferences: { centerName: 'IES Ejemplo', receiptPrice: 25, receiptSubtitle: 'Orla 2º Bachillerato', orlaEnabled: true }
    });

    expect(config.loadGlobalConfig()).toMatchObject({
      printer: { name: 'EPSON TM-T20II Receipt' },
      ...expected.savedConfig,
      ...expected.fromMainJs
    });
  });

  test('should keep the workspaces', () => {
    const store = new WorkspaceStore({ load: config.getWorkspaceSettings, save: config.saveWorkspaceSettings });
    const list = store.list();

    expect(list.some((w) => w.name === 'Orla con historial' && !w.builtIn)).toBe(expected.customWorkspace);
    expect(list.find((w) => w.id === 'revision')).toMatchObject({ builtIn: true, hidden: expected.hiddenBuiltIn });
    expect(list.filter((w) => w.builtIn).map((w) => w.id)).toEqual(['captura', 'revision', 'carnets']);
  });

  test('should read the recent projects', () => {
    expect(recentProjects.loadRecentProjects()).toEqual([expect.stringMatching(/Fotos curso 2025-26$/)]);
  });
});
