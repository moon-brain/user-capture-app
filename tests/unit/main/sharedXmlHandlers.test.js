/**
 * The shared school XML in the repository handlers
 *
 * A new project gets its repository after it is created, so configuring the
 * repository is when its XML is shared; and Proyecto > Información del
 * proyecto reports where and by whom it was published. Driven through the
 * real handlers against a real database.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../../src/main/database');

const mockHandlers = new Map();
let mockUserDataPath;

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockHandlers.set(channel, handler))
  },
  dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn(), showMessageBox: jest.fn() },
  shell: { openPath: jest.fn(), openExternal: jest.fn() },
  app: {
    getPath: jest.fn(() => mockUserDataPath),
    getVersion: jest.fn(() => '0.0.0-test')
  },
  BrowserWindow: jest.fn()
}));

const { registerMiscHandlers } = require('../../../src/main/ipc/miscHandlers');
const { hashXml, setAppliedXml, getAppliedXml, publishXml } = require('../../../src/main/sharedXml');

const logger = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  section: jest.fn()
};

describe('shared XML handlers', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-shared-xml-handler-tests');
  const XML = Buffer.from('<centro curso="2026"><alumnos><alumno NIA="1001"/></alumnos></centro>');
  let testId = 0;
  let projectPath;
  let repositoryPath;
  let xmlPath;
  let state;
  let reinitializeRepositoryMirror;

  const centroFiles = () => {
    const centro = path.join(repositoryPath, 'Centro');
    return fs.existsSync(centro) ? fs.readdirSync(centro) : [];
  };
  const configure = (folder) => mockHandlers.get('set-image-repository-path')({}, folder);
  const details = () => mockHandlers.get('get-project-details')({});

  beforeAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.mkdirSync(fixturesPath, { recursive: true });

    state = { dbManager: null, projectPath: null };
    reinitializeRepositoryMirror = jest.fn(async () => {});

    registerMiscHandlers({
      mainWindow: () => null,
      logger,
      state,
      imageGridWindow: () => null,
      repositoryGridWindow: () => null,
      createMenu: jest.fn(),
      reinitializeRepositoryMirror,
      repositoryMirror: () => null
    });
  });

  afterAll(async () => {
    if (state.dbManager) await state.dbManager.close();
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  beforeEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();

    if (state.dbManager) await state.dbManager.close();

    testId++;
    projectPath = path.join(fixturesPath, `project-${testId}`);
    repositoryPath = path.join(fixturesPath, `deposito-${testId}`);
    mockUserDataPath = path.join(fixturesPath, `userData-${testId}`);
    fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'imports'));
    fs.mkdirSync(repositoryPath);
    fs.mkdirSync(mockUserDataPath);

    xmlPath = path.join(projectPath, 'centro.xml');
    fs.writeFileSync(xmlPath, XML);

    const db = new DatabaseManager(path.join(projectPath, 'data', 'users.db'));
    await db.initialize();
    await db.setProjectSetting('xmlFilePath', xmlPath);
    await setAppliedXml(db, { hash: hashXml(XML), fileName: null, appliedAt: new Date().toISOString() });

    state.dbManager = db;
    state.projectPath = projectPath;
  });

  describe('configuring the repository', () => {
    test('should publish the XML a new project applied', async () => {
      const result = await configure(repositoryPath);

      expect(result.success).toBe(true);
      expect(result.sharedXml.status).toBe('published');
      expect(centroFiles()).toEqual([result.sharedXml.fileName]);
      expect((await getAppliedXml(state.dbManager)).fileName).toBe(result.sharedXml.fileName);
    });

    test('should restart the mirror before publishing, as before', async () => {
      await configure(repositoryPath);

      expect(reinitializeRepositoryMirror).toHaveBeenCalledTimes(1);
    });

    test('should take an XML another team already published instead of adding a copy', async () => {
      const { fileName } = await publishXml(repositoryPath, XML, { team: 'DIRECCION' });

      const result = await configure(repositoryPath);

      expect(result.sharedXml).toEqual({ status: 'already', fileName });
      expect(centroFiles()).toEqual([fileName]);
    });

    test('should configure the repository even when the XML cannot be published', async () => {
      fs.writeFileSync(xmlPath, 'otro contenido');

      const result = await configure(repositoryPath);

      expect(result.success).toBe(true);
      expect(result.sharedXml.status).toBe('changed');
      await expect(state.dbManager.getProjectSetting('imageRepositoryPath')).resolves.toBe(repositoryPath);
      expect(centroFiles()).toEqual([]);
    });

    test('should publish nothing for a project from before it was recorded', async () => {
      await state.dbManager.deleteProjectSetting('sharedXml');

      const result = await configure(repositoryPath);

      expect(result.sharedXml.status).toBe('not-applied');
      expect(centroFiles()).toEqual([]);
    });
  });

  describe('the project information', () => {
    test('should report the published file, its date and its team', async () => {
      await publishXml(repositoryPath, XML, { now: new Date(2026, 9, 31, 18, 5), team: 'DIRECCION' });
      await configure(repositoryPath);

      const { info } = await details();

      expect(info.sharedXml).toEqual(expect.objectContaining({
        fileName: 'centro_20261031180500_DIRECCION.xml',
        publishedAt: new Date(2026, 9, 31, 18, 5).toISOString(),
        publishedBy: 'DIRECCION'
      }));
    });

    test('should report an applied XML that is not published yet', async () => {
      const { info } = await details();

      expect(info.sharedXml).toEqual(expect.objectContaining({ fileName: null, publishedBy: null }));
    });

    test('should report nothing for a project from before it was recorded', async () => {
      await state.dbManager.deleteProjectSetting('sharedXml');

      const { info } = await details();

      expect(info.sharedXml).toBeNull();
    });
  });
});
