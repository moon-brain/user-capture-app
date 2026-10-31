/**
 * XML update tests
 *
 * Updating the XML decides who is kept, who is added, who is filed under
 * Eliminados and who is removed outright. Getting that wrong loses student
 * records, so these drive the real handlers against a real database.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../../src/main/database');

const mockHandlers = new Map();
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockHandlers.set(channel, handler))
  },
  dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn() }
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

const DELETED_GROUP = { code: 'ELIMINADOS', name: '⚠ Eliminados' };

// Ver > Fotografías por grupo, open while the XML is updated
const coverageWindow = {
  isDestroyed: () => false,
  webContents: { send: jest.fn() }
};

describe('XML update', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-xmlupdate-tests');
  let testId = 0;
  let projectPath;
  let db;
  let state;

  const writeXml = (body, attributes = '') => {
    const xmlPath = path.join(projectPath, `centro-${testId}.xml`);
    fs.writeFileSync(xmlPath, `<centro${attributes}>${body}</centro>`, 'utf8');
    return xmlPath;
  };

  const studentXml = (nia, group = '1ESOA', name = 'ANA') =>
    `<alumno nombre="${name}" apellido1="GARCIA" apellido2="LOPEZ" NIA="${nia}" grupo="${group}"/>`;

  const teacherXml = (document, name = 'MARIA') =>
    `<docente nombre="${name}" apellido1="RUIZ" documento="${document}"/>`;

  const groupsXml = '<grupos><grupo codigo="1ESOA" nombre="Primero ESO A"/><grupo codigo="2ESOB" nombre="Segundo ESO B"/></grupos>';

  const analyse = (xmlPath) => mockHandlers.get('update-xml')({}, xmlPath);
  const apply = (analysis) =>
    mockHandlers.get('confirm-update-xml')({}, {
      groups: analysis.groups,
      newUsersMap: analysis.newUsersMap,
      deletedUsers: analysis.deletedUsers,
      currentUsers: analysis.currentUsers,
      xmlPath: analysis.xmlPath,
      academicYear: analysis.academicYear?.incoming ?? null
    });

  const usersInDb = async () => {
    const users = await db.getUsers({});
    return users.map(u => ({
      nia: u.nia,
      document: u.document,
      first_name: u.first_name,
      group_code: u.group_code,
      image_path: u.image_path
    }));
  };

  beforeAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.mkdirSync(fixturesPath, { recursive: true });

    state = { dbManager: null, projectPath: null };

    registerProjectHandlers({
      mainWindow: () => null,
      logger,
      state,
      addRecentProject: jest.fn(),
      updateWindowTitle: jest.fn(),
      closeCurrentProject: jest.fn(),
      ensureRepositoryMirrorStarted: jest.fn(),
      groupCoverageWindow: () => coverageWindow,
      ensureDeletedGroup: async () => {
        const groups = await state.dbManager.getGroups();
        if (!groups.find(g => g.code === DELETED_GROUP.code)) {
          await state.dbManager.importUsers({
            groups: [DELETED_GROUP],
            students: [],
            teachers: [],
            nonTeachingStaff: []
          });
        }
        return DELETED_GROUP;
      }
    });
  });

  afterAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  beforeEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();

    testId++;
    projectPath = path.join(fixturesPath, `project-${testId}`);
    fs.mkdirSync(path.join(projectPath, 'imports'), { recursive: true });

    db = new DatabaseManager(path.join(projectPath, 'users.db'));
    await db.initialize();

    state.dbManager = db;
    state.projectPath = projectPath;

    // Starting point: two students and one teacher already imported
    await db.importUsers({
      groups: [{ code: '1ESOA', name: 'Primero ESO A' }],
      students: [
        { first_name: 'ANA', last_name1: 'GARCIA', last_name2: 'LOPEZ', nia: '1001', group_code: '1ESOA', document: '', birth_date: '2008-01-01' },
        { first_name: 'LUIS', last_name1: 'PEREZ', last_name2: '', nia: '1002', group_code: '1ESOA', document: '', birth_date: '2008-02-02' }
      ],
      teachers: [
        { first_name: 'MARIA', last_name1: 'RUIZ', last_name2: '', document: 'D100', birth_date: '1980-01-01' }
      ],
      nonTeachingStaff: []
    });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('analysis', () => {
    test('should refuse to run without an open project', async () => {
      state.dbManager = null;

      const result = await analyse('whatever.xml');

      expect(result.success).toBe(false);
      state.dbManager = db;
    });

    test('should reject an XML path that does not exist', async () => {
      const result = await analyse(path.join(projectPath, 'missing.xml'));

      expect(result.success).toBe(false);
    });

    test('should report an unchanged roll as nothing added or deleted', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      const result = await analyse(xmlPath);

      expect(result.changes.toAdd).toBe(0);
      expect(result.changes.toDelete).toBe(0);
      expect(result.changes.toUpdate).toBe(3);
    });

    test('should match students by an NIA made only of digits', async () => {
      // A mismatch between how the XML and the database hold the NIA would
      // see every student as new and every existing one as deleted
      const xmlPath = writeXml(`${groupsXml}<alumnos>${studentXml(1001)}</alumnos>`);

      const result = await analyse(xmlPath);

      expect(result.changes.toAdd).toBe(0);
    });

    test('should count a student missing from the XML as deleted', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}</alumnos><docentes>${teacherXml('D100')}</docentes>`
      );

      const result = await analyse(xmlPath);

      expect(result.changes.toDelete).toBe(1);
      expect(result.deletedUsers[0].nia).toBe('1002');
    });

    test('should count a student only in the XML as new', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}${studentXml(1003, '2ESOB', 'NUEVA')}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      const result = await analyse(xmlPath);

      expect(result.changes.toAdd).toBe(1);
    });

    test('should match staff by document, not by NIA', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      const result = await analyse(xmlPath);

      expect(result.deletedUsers.map(u => u.document)).not.toContain('D100');
    });

    test('should refuse an XML with nobody in it instead of deleting everyone', async () => {
      const xmlPath = path.join(projectPath, `vacio-${testId}.xml`);
      fs.writeFileSync(xmlPath, `<centro codigo="46016397" curso="2026">${groupsXml}</centro>`, 'utf8');

      const result = await analyse(xmlPath);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ningún usuario/);
      expect(await db.getUsers({})).toHaveLength(3);
    });

    test('should separate deletions that would lose a photo', async () => {
      const [ana] = await db.getUsers({});
      await db.linkImageToUser(ana.id, 'foto.jpg');

      // Everyone replaced by a newcomer: a roll with nobody in it is refused
      const xmlPath = writeXml(`${groupsXml}<alumnos>${studentXml(3001)}</alumnos>`);

      const result = await analyse(xmlPath);

      expect(result.changes.toDeleteWithImage).toBe(1);
      expect(result.changes.toDeleteWithoutImage).toBe(2);
    });
  });

  describe('the XML recorded for the project information', () => {
    const PREVIOUS = 'C:\\anterior\\centro.xml';
    const recorded = () => db.getProjectSetting('xmlFilePath');
    const unchangedRoll = () => writeXml(
      `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
      `<docentes>${teacherXml('D100')}</docentes>`
    );

    beforeEach(async () => {
      await db.setProjectSetting('xmlFilePath', PREVIOUS);
    });

    test('should keep the previous one when the new file does not exist', async () => {
      await analyse(path.join(projectPath, 'no-existe.xml'));

      await expect(recorded()).resolves.toBe(PREVIOUS);
    });

    test('should keep the previous one when the new file cannot be read', async () => {
      await analyse(writeXml('<alumnos><alumno nombre="ANA"'));

      await expect(recorded()).resolves.toBe(PREVIOUS);
    });

    test('should keep the previous one while the changes wait for confirmation', async () => {
      await analyse(unchangedRoll());

      await expect(recorded()).resolves.toBe(PREVIOUS);
    });

    test('should record the new one once the changes are applied', async () => {
      const xmlPath = unchangedRoll();

      await apply(await analyse(xmlPath));

      await expect(recorded()).resolves.toBe(xmlPath);
    });
  });

  // The other teams find the XML in the repository's Centro folder
  // (sharedXml.js has the details); here, that applying an update publishes
  // it and that nothing about publishing can stop the update
  describe('sharing the XML with the other teams', () => {
    const { getAppliedXml, hashXml } = require('../../../src/main/sharedXml');
    let repositoryPath;
    const centroFiles = () => {
      const centro = path.join(repositoryPath, 'Centro');
      return fs.existsSync(centro) ? fs.readdirSync(centro) : [];
    };
    const unchangedRoll = () => writeXml(
      `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
      `<docentes>${teacherXml('D100')}</docentes>`
    );

    beforeEach(async () => {
      repositoryPath = path.join(projectPath, 'Fotos Usuarios');
      fs.mkdirSync(repositoryPath);
      await db.setProjectSetting('imageRepositoryPath', repositoryPath);
    });

    test('should publish the applied XML, byte for byte', async () => {
      const xmlPath = unchangedRoll();

      const result = await apply(await analyse(xmlPath));

      expect(result.success).toBe(true);
      expect(result.sharedXml.status).toBe('published');
      expect(centroFiles()).toEqual([result.sharedXml.fileName]);
      expect(fs.readFileSync(path.join(repositoryPath, 'Centro', result.sharedXml.fileName))
        .equals(fs.readFileSync(xmlPath))).toBe(true);
    });

    test('should record what was applied and where it was published', async () => {
      const xmlPath = unchangedRoll();

      const result = await apply(await analyse(xmlPath));

      const applied = await getAppliedXml(db);
      expect(applied.hash).toBe(hashXml(fs.readFileSync(xmlPath)));
      expect(applied.fileName).toBe(result.sharedXml.fileName);
    });

    test('should not publish the same XML twice', async () => {
      const xmlPath = unchangedRoll();
      await apply(await analyse(xmlPath));

      const again = await apply(await analyse(xmlPath));

      expect(again.sharedXml.status).toBe('already');
      expect(centroFiles()).toHaveLength(1);
    });

    test('should not publish until the changes are confirmed', async () => {
      await analyse(unchangedRoll());

      expect(centroFiles()).toEqual([]);
    });

    test('should still update a project without a repository, and say it was not shared', async () => {
      await db.deleteProjectSetting('imageRepositoryPath');

      const result = await apply(await analyse(unchangedRoll()));

      expect(result.success).toBe(true);
      expect(result.sharedXml.status).toBe('no-repository');
      expect((await getAppliedXml(db)).fileName).toBeNull();
    });

    test('should still update when the repository is unavailable', async () => {
      await db.setProjectSetting('imageRepositoryPath', path.join(projectPath, 'desconectada'));

      const result = await apply(await analyse(unchangedRoll()));

      expect(result.success).toBe(true);
      expect(result.sharedXml.status).toBe('repository-unavailable');
    });
  });

  // check-shared-xml: what the notice of a more recent XML asks
  describe('a more recent XML published by another team', () => {
    const { publishXml } = require('../../../src/main/sharedXml');
    let repositoryPath;
    const check = () => mockHandlers.get('check-shared-xml')({});
    const roll = (extra = '') =>
      `<centro curso="2026">${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}${extra}</alumnos>` +
      `<docentes>${teacherXml('D100')}</docentes></centro>`;
    const writeRoll = (extra) => {
      const xmlPath = path.join(projectPath, `roll-${Math.random()}.xml`);
      fs.writeFileSync(xmlPath, roll(extra), 'utf8');
      return xmlPath;
    };
    const publishFromAnotherTeam = (extra, now = new Date(Date.now() + 60 * 60 * 1000)) =>
      publishXml(repositoryPath, Buffer.from(roll(extra)), { now, team: 'PC-FOTOS' });

    beforeEach(async () => {
      state.sharedXmlCheck = null;
      repositoryPath = path.join(projectPath, 'Fotos Usuarios');
      fs.mkdirSync(repositoryPath);
      await db.setProjectSetting('imageRepositoryPath', repositoryPath);
      await db.setProjectSetting('academicYear', '2026');
      // This team applies and publishes its XML
      await apply(await analyse(writeRoll()));
    });

    test('should find nothing while this project has the latest', async () => {
      await expect(check()).resolves.toEqual({ success: true, newer: null });
    });

    test('should report a later XML of the course, with where it is', async () => {
      const { fileName } = await publishFromAnotherTeam(studentXml(1003));

      const result = await check();

      expect(result.newer).toEqual(expect.objectContaining({
        fileName,
        filePath: path.join(repositoryPath, 'Centro', fileName),
        team: 'PC-FOTOS'
      }));
    });

    test('should read Centro once a minute at most', async () => {
      await check();
      await publishFromAnotherTeam(studentXml(1003));

      await expect(check()).resolves.toEqual({ success: true, newer: null });

      state.sharedXmlCheck.at -= 61 * 1000;
      await expect(check()).resolves.toEqual(expect.objectContaining({ newer: expect.any(Object) }));
    });

    test('should look again at once after applying the published XML, and find it applied', async () => {
      const { fileName } = await publishFromAnotherTeam(studentXml(1003));
      const { newer } = await check();
      expect(newer.fileName).toBe(fileName);

      const result = await apply(await analyse(newer.filePath));

      expect(result.sharedXml).toEqual({ status: 'already', fileName });
      await expect(check()).resolves.toEqual({ success: true, newer: null });
    });

    test('should say nothing without a repository', async () => {
      await db.deleteProjectSetting('imageRepositoryPath');

      await expect(check()).resolves.toEqual({ success: true, newer: null, reason: 'no-repository' });
    });

    test('should say nothing while the repository is unavailable', async () => {
      await db.setProjectSetting('imageRepositoryPath', path.join(projectPath, 'desconectada'));

      await expect(check()).resolves.toEqual({ success: true, newer: null, reason: 'repository-unavailable' });
    });

    test('should refuse without an open project', async () => {
      state.dbManager = null;

      await expect(check()).resolves.toEqual(expect.objectContaining({ success: false }));
    });
  });

  describe('the course', () => {
    const roll = (course) => writeXml(
      `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
      `<docentes>${teacherXml('D100')}</docentes>`,
      course ? ` curso="${course}"` : ''
    );
    const recorded = () => db.getProjectSetting('academicYear');

    test('should report the project course and the XML one before applying', async () => {
      await db.setProjectSetting('academicYear', '2025');

      const analysis = await analyse(roll('2026'));

      expect(analysis.academicYear).toEqual({ current: 2025, incoming: 2026 });
      await expect(recorded()).resolves.toBe('2025');
    });

    test('should report no project course for a project that never recorded one', async () => {
      const analysis = await analyse(roll('2026'));

      expect(analysis.academicYear).toEqual({ current: null, incoming: 2026 });
    });

    test('should record the XML course once the changes are applied', async () => {
      await db.setProjectSetting('academicYear', '2025');

      await apply(await analyse(roll('2026')));

      await expect(recorded()).resolves.toBe('2026');
    });

    test('should keep the project course when the XML does not give one', async () => {
      await db.setProjectSetting('academicYear', '2025');

      await apply(await analyse(roll(null)));

      await expect(recorded()).resolves.toBe('2025');
    });
  });

  describe('identifiers an older import stored without their leading zeros', () => {
    // What a project imported before the parser kept attributes as text holds
    // for an NIA "0123456" and a document "01234567"
    beforeEach(async () => {
      await db.importUsers({
        groups: [],
        students: [
          { first_name: 'EVA', last_name1: 'SOLER', last_name2: '', nia: '123456', group_code: '1ESOA', document: '', birth_date: '2008-03-03' }
        ],
        teachers: [
          { first_name: 'JUAN', last_name1: 'MARTIN', last_name2: '', document: '1234567', birth_date: '1975-01-01' }
        ],
        nonTeachingStaff: []
      });

      const eva = (await db.getUsers({})).find(u => u.first_name === 'EVA');
      await db.linkImageToUser(eva.id, 'eva.jpg');
    });

    const rollWithZeros = () => writeXml(
      `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}` +
      '<alumno nombre="EVA" apellido1="SOLER" NIA="0123456" grupo="1ESOA" fecha_nac="2008-03-03"/></alumnos>' +
      `<docentes>${teacherXml('D100')}<docente nombre="JUAN" apellido1="MARTIN" documento="01234567" fecha_nac="1975-01-01"/></docentes>`
    );

    test('should recognise them instead of reporting them as removed and new', async () => {
      const result = await analyse(rollWithZeros());

      expect(result.changes.toAdd).toBe(0);
      expect(result.changes.toDelete).toBe(0);
    });

    test('should store them as the XML has them, zeros included', async () => {
      await apply(await analyse(rollWithZeros()));

      const users = await usersInDb();
      expect(users.find(u => u.first_name === 'EVA').nia).toBe('0123456');
      expect(users.find(u => u.first_name === 'JUAN').document).toBe('01234567');
    });

    test('should keep the photo and the group of the user it recognised', async () => {
      await apply(await analyse(rollWithZeros()));

      const eva = (await usersInDb()).find(u => u.first_name === 'EVA');
      expect(eva.image_path).toBe('eva.jpg');
      expect(eva.group_code).toBe('1ESOA');
    });

    test('should not take identifiers that differ in more than zeros for the same person', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}` +
        '<alumno nombre="EVA" apellido1="SOLER" NIA="0123457" grupo="1ESOA"/></alumnos>' +
        `<docentes>${teacherXml('D100')}<docente nombre="JUAN" apellido1="MARTIN" documento="01234567"/></docentes>`
      );

      const result = await analyse(xmlPath);

      expect(result.changes.toAdd).toBe(1);
      expect(result.changes.toDelete).toBe(1);
    });
  });

  describe('names and identifiers an older import stored with character references', () => {
    // Before the parser decoded &#NNN; it stored it as written
    beforeEach(async () => {
      await db.importUsers({
        groups: [],
        students: [
          { first_name: '&#209;URIA', last_name1: 'PE&#xD1;A', last_name2: '', nia: '1003', group_code: '1ESOA', document: '', birth_date: '' }
        ],
        teachers: [
          { first_name: 'JUAN', last_name1: 'MARTIN', last_name2: '', document: '&#49;2345678Z', birth_date: '' }
        ],
        nonTeachingStaff: []
      });
      const users = await db.getUsers({});
      await db.linkImageToUser(users.find(u => u.last_name1 === 'MARTIN').id, 'juan.jpg');
    });

    const roll = () => writeXml(
      `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}` +
      '<alumno nombre="&#209;URIA" apellido1="PE&#xD1;A" NIA="1003" grupo="1ESOA"/></alumnos>' +
      `<docentes>${teacherXml('D100')}<docente nombre="JUAN" apellido1="MARTIN" documento="&#49;2345678Z"/></docentes>`
    );

    test('should recognise the same people, keeping the photo', async () => {
      const result = await analyse(roll());
      expect(result.changes.toAdd).toBe(0);
      expect(result.changes.toDelete).toBe(0);

      await apply(result);
      const juan = (await usersInDb()).find(u => u.document === '12345678Z');
      expect(juan.image_path).toBe('juan.jpg');
    });

    test('should store the names decoded', async () => {
      await apply(await analyse(roll()));

      const nuria = (await db.getUsers({})).find(u => u.nia === '1003');
      expect(nuria.first_name).toBe('ÑURIA');
      expect(nuria.last_name1).toBe('PEÑA');
    });
  });

  describe('applying the update', () => {
    test('should add the students that were only in the XML', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}${studentXml(1003, '2ESOB', 'NUEVA')}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      const result = await apply(await analyse(xmlPath));

      expect(result.success).toBe(true);
      expect((await usersInDb()).map(u => u.nia)).toContain('1003');
    });

    test('should add many new students in one import', async () => {
      const newcomers = Array.from({ length: 30 }, (_, i) => studentXml(2000 + i, '2ESOB', `ALU${i}`)).join('');
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}${newcomers}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      await apply(await analyse(xmlPath));

      expect(await db.getUsers({})).toHaveLength(33);
    });

    test('should keep a user who has a photo, moved to Eliminados', async () => {
      const [ana] = await db.getUsers({});
      await db.linkImageToUser(ana.id, 'foto.jpg');

      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1002, '1ESOA', 'LUIS')}</alumnos><docentes>${teacherXml('D100')}</docentes>`
      );

      await apply(await analyse(xmlPath));

      const kept = (await usersInDb()).find(u => u.nia === '1001');
      expect(kept).toBeDefined();
      expect(kept.group_code).toBe(DELETED_GROUP.code);
      expect(kept.image_path).toBe('foto.jpg');
    });

    test('should remove a user with no photo outright', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1002, '1ESOA', 'LUIS')}</alumnos><docentes>${teacherXml('D100')}</docentes>`
      );

      await apply(await analyse(xmlPath));

      expect((await usersInDb()).map(u => u.nia)).not.toContain('1001');
    });

    test('should leave everyone in place when the roll is unchanged', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      const before = await usersInDb();
      await apply(await analyse(xmlPath));

      expect(await usersInDb()).toHaveLength(before.length);
    });

    test('should not lose a linked photo when a student changes group', async () => {
      const [ana] = await db.getUsers({});
      await db.linkImageToUser(ana.id, 'foto.jpg');

      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001, '2ESOB')}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      await apply(await analyse(xmlPath));

      const moved = (await usersInDb()).find(u => u.nia === '1001');
      expect(moved.group_code).toBe('2ESOB');
      expect(moved.image_path).toBe('foto.jpg');
    });

    test('should register the groups declared in the XML', async () => {
      const xmlPath = writeXml(
        `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1002, '1ESOA', 'LUIS')}</alumnos>` +
        `<docentes>${teacherXml('D100')}</docentes>`
      );

      await apply(await analyse(xmlPath));

      const codes = (await db.getGroups()).map(g => g.code);
      expect(codes).toContain('2ESOB');
    });
  });

  describe('the photos by group window', () => {
    const rosterXml = () => writeXml(
      `${groupsXml}<alumnos>${studentXml(1001)}${studentXml(1003, '2ESOB', 'NUEVA')}</alumnos>` +
      `<docentes>${teacherXml('D100')}</docentes>`
    );

    test('should be told to reload once the changes are applied', async () => {
      const analysis = await analyse(rosterXml());
      expect(coverageWindow.webContents.send).not.toHaveBeenCalled();

      await apply(analysis);

      expect(coverageWindow.webContents.send).toHaveBeenCalledWith('captured-images-changed');
    });

    test('should be told to reload when applying fails halfway', async () => {
      const analysis = await analyse(rosterXml());
      jest.spyOn(db, 'importUsers').mockRejectedValueOnce(new Error('disk full'));

      const result = await apply(analysis);

      expect(result.success).toBe(false);
      expect(coverageWindow.webContents.send).toHaveBeenCalledWith('captured-images-changed');
    });
  });
});
