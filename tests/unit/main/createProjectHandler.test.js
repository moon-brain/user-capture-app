/**
 * create-project handler tests
 *
 * Creating a project takes over the same shared state as opening one, so the
 * project already open has to be released first: its folder watcher and its
 * database connection used to stay alive. And nothing may be closed or
 * created until the XML has been read, so a broken file changes nothing.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../../src/main/database');
const FolderWatcher = require('../../../src/main/folderWatcher');

const mockHandlers = new Map();
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockHandlers.set(channel, handler))
  },
  dialog: { showMessageBox: jest.fn(), showErrorBox: jest.fn(), showOpenDialog: jest.fn() },
  app: { getPath: jest.fn(() => require('os').tmpdir()) }
}));

const { registerProjectHandlers } = require('../../../src/main/ipc/projectHandlers');

const logger = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  section: jest.fn(),
  initialize: jest.fn(),
  close: jest.fn()
};

const XML = `<centro>
  <grupos><grupo codigo="1ESOA" nombre="Primero ESO A"/></grupos>
  <alumnos>
    <alumno nombre="ANA" apellido1="GARCIA" NIA="1001" grupo="1ESOA" fecha_nac="2010-01-01"/>
    <alumno nombre="LUIS" apellido1="PEREZ" NIA="1002" grupo="1ESOA" fecha_nac="2010-02-02"/>
  </alumnos>
</centro>`;

describe('create-project handler', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-create-project-tests');
  let testId = 0;
  let workPath;
  let state;
  let closeCurrentProject;
  let closedWhileOpen;
  let oldProject;

  const create = (folderPath, xmlPath) => mockHandlers.get('create-project')({}, { folderPath, xmlPath });

  const writeXml = (content) => {
    const xmlPath = path.join(workPath, 'centro.xml');
    fs.writeFileSync(xmlPath, content, 'utf8');
    return xmlPath;
  };

  beforeAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.mkdirSync(fixturesPath, { recursive: true });

    state = { dbManager: null, projectPath: null, folderWatcher: null, imageManager: null };

    // What main.js does, recording which project was open when it ran
    closeCurrentProject = jest.fn(async () => {
      closedWhileOpen.push(state.projectPath);
      if (state.folderWatcher) {
        await state.folderWatcher.stop();
        state.folderWatcher = null;
      }
      if (state.dbManager) {
        await state.dbManager.close();
        state.dbManager = null;
      }
      state.imageManager = null;
      state.projectPath = null;
    });

    registerProjectHandlers({
      mainWindow: () => null,
      logger,
      state,
      addRecentProject: jest.fn(),
      updateWindowTitle: jest.fn(),
      closeCurrentProject,
      ensureRepositoryMirrorStarted: jest.fn(),
      repositoryMirror: () => null
    });
  });

  afterAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  beforeEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    closedWhileOpen = [];

    testId++;
    workPath = path.join(fixturesPath, `case-${testId}`);
    fs.mkdirSync(workPath, { recursive: true });

    // A project already open, with its own database and watcher
    const oldPath = path.join(workPath, 'anterior');
    fs.mkdirSync(path.join(oldPath, 'ingest'), { recursive: true });
    fs.mkdirSync(path.join(oldPath, 'imports'), { recursive: true });
    const oldDb = new DatabaseManager(path.join(oldPath, 'users.db'));
    await oldDb.initialize();
    const oldWatcher = new FolderWatcher(path.join(oldPath, 'ingest'), path.join(oldPath, 'imports'));
    await oldWatcher.start();

    oldProject = { path: oldPath, db: oldDb, watcher: oldWatcher };
    Object.assign(state, { projectPath: oldPath, dbManager: oldDb, folderWatcher: oldWatcher });
  });

  afterEach(async () => {
    if (state.folderWatcher) await state.folderWatcher.stop();
    if (state.dbManager) await state.dbManager.close();
    await oldProject.watcher.stop();
    await oldProject.db.close();
    Object.assign(state, { projectPath: null, dbManager: null, folderWatcher: null });
    jest.restoreAllMocks();
  });

  test('should close the open project before taking over', async () => {
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);

    const result = await create(newPath, writeXml(XML));

    expect(result.success).toBe(true);
    expect(closeCurrentProject).toHaveBeenCalledTimes(1);
    expect(closedWhileOpen).toEqual([oldProject.path]);
  });

  test('should release the database and folder watcher of the previous project', async () => {
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);

    await create(newPath, writeXml(XML));

    expect(oldProject.db.db).toBeNull();
    expect(oldProject.watcher.watcher).toBeNull();
    expect(state.dbManager).not.toBe(oldProject.db);
    expect(state.folderWatcher).not.toBe(oldProject.watcher);
    expect(state.projectPath).toBe(newPath);
  });

  test('should import the users of the XML into the new project', async () => {
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);

    const result = await create(newPath, writeXml(XML));

    expect(result.users.map(user => user.nia).sort()).toEqual(['1001', '1002']);
    expect(fs.existsSync(path.join(newPath, 'data', 'users.db'))).toBe(true);
  });

  test('should record the course the XML is for', async () => {
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);

    await create(newPath, writeXml(XML.replace('<centro>', '<centro curso="2026">')));

    await expect(state.dbManager.getProjectSetting('academicYear')).resolves.toBe('2026');
  });

  // A new project has no repository yet: its XML is shared once it gets one
  test('should record the XML it applied, to publish it once it has a repository', async () => {
    const { getAppliedXml, hashXml } = require('../../../src/main/sharedXml');
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);
    const xmlPath = writeXml(XML);

    await create(newPath, xmlPath);

    const applied = await getAppliedXml(state.dbManager);
    expect(applied.hash).toBe(hashXml(fs.readFileSync(xmlPath)));
    expect(applied.fileName).toBeNull();
  });

  test('should record no course when the XML does not give one', async () => {
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);

    await create(newPath, writeXml(XML));

    await expect(state.dbManager.getProjectSetting('academicYear')).resolves.toBeNull();
  });

  test('should leave the open project alone when the XML cannot be read', async () => {
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);

    const result = await create(newPath, writeXml('<centro><alumnos><alumno nombre="ANA"'));

    expect(result.success).toBe(false);
    expect(closeCurrentProject).not.toHaveBeenCalled();
    expect(state.projectPath).toBe(oldProject.path);
    expect(state.dbManager).toBe(oldProject.db);
  });

  test('should create nothing in the folder when the XML cannot be read', async () => {
    const newPath = path.join(workPath, 'nuevo');
    fs.mkdirSync(newPath);

    await create(newPath, writeXml('<centro><alumnos><alumno nombre="ANA"'));

    expect(fs.readdirSync(newPath)).toEqual([]);
  });

  describe('a folder that already holds a project', () => {
    let existingPath;
    let usersBefore;

    beforeEach(async () => {
      // A project someone created earlier in this folder
      existingPath = path.join(workPath, 'existente');
      const db = new DatabaseManager(path.join(existingPath, 'data', 'users.db'));
      fs.mkdirSync(path.join(existingPath, 'data'), { recursive: true });
      await db.initialize();
      await db.importUsers({
        groups: [{ code: '1ESOA', name: 'Primero ESO A' }],
        students: [{ first_name: 'ANA', last_name1: 'GARCIA', last_name2: '', nia: '1001', group_code: '1ESOA', document: '', birth_date: '2010-01-01' }],
        teachers: [],
        nonTeachingStaff: []
      });
      usersBefore = (await db.getUsers({})).length;
      await db.close();
    });

    test('should refuse it and point to opening the project instead', async () => {
      const result = await create(existingPath, writeXml(XML));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ya contiene un proyecto/);
      expect(result.error).toMatch(/Archivo > Abrir Proyecto/);
    });

    test('should not import the XML on top of its users', async () => {
      await create(existingPath, writeXml(XML));

      const db = new DatabaseManager(path.join(existingPath, 'data', 'users.db'));
      await db.initialize();
      const usersAfter = (await db.getUsers({})).length;
      await db.close();

      expect(usersAfter).toBe(usersBefore);
    });

    test('should leave the open project alone', async () => {
      await create(existingPath, writeXml(XML));

      expect(closeCurrentProject).not.toHaveBeenCalled();
      expect(state.dbManager).toBe(oldProject.db);
    });
  });

  test('should leave the open project alone when the folder does not exist', async () => {
    const result = await create(path.join(workPath, 'no-existe'), writeXml(XML));

    expect(result.success).toBe(false);
    expect(closeCurrentProject).not.toHaveBeenCalled();
    expect(state.dbManager).toBe(oldProject.db);
  });
});
