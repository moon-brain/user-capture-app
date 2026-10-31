/**
 * Publishing the school XML in the repository's Centro folder
 *
 * What must hold: an XML is published once, whoever publishes it, so a team
 * applying another's XML does not publish it back; nothing already in Centro
 * is ever overwritten; a file is never visible half written; and only what
 * the project really applied is published.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  SHARED_XML_FOLDER,
  hashXml,
  publishedFileName,
  parsePublishedName,
  publishXml,
  getAppliedXml,
  setAppliedXml,
  publishAppliedXml,
  publishProjectXml,
  readCourse,
  findNewerXml
} = require('../../../src/main/sharedXml');

describe('sharedXml', () => {
  const fixtures = path.join(os.tmpdir(), 'edu-capture-shared-xml-tests');
  let testId = 0;
  let root;
  let repositoryPath;
  let centroPath;

  const NOW = new Date(2026, 9, 31, 18, 5, 9);
  const XML = Buffer.from('<?xml version="1.0"?><centro curso="2026"><alumnos/></centro>');
  const OTHER = Buffer.from('<?xml version="1.0"?><centro curso="2026"><docentes/></centro>');

  const centroFiles = () => (fs.existsSync(centroPath) ? fs.readdirSync(centroPath).sort() : []);

  /** In-memory project_settings */
  const makeDb = (settings = {}) => ({
    settings,
    getProjectSetting: jest.fn(async (key) => (key in settings ? settings[key] : null)),
    setProjectSetting: jest.fn(async (key, value) => { settings[key] = value; })
  });

  beforeAll(() => {
    jest.useRealTimers();
    fs.rmSync(fixtures, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(fixtures, { recursive: true, force: true });
  });

  beforeEach(() => {
    testId += 1;
    root = path.join(fixtures, `t${testId}`);
    repositoryPath = path.join(root, 'Fotos Usuarios');
    centroPath = path.join(repositoryPath, SHARED_XML_FOLDER);
    fs.mkdirSync(repositoryPath, { recursive: true });
  });

  describe('file names', () => {
    test('should name a publication by its local time and team', () => {
      expect(publishedFileName(NOW, 'DIRECCION')).toBe('centro_20261031180509_DIRECCION.xml');
    });

    test('should read the time and team back from the name', () => {
      const parsed = parsePublishedName('centro_20261031180509_PC-FOTOS_2.xml');

      expect(parsed.team).toBe('PC-FOTOS_2');
      expect(parsed.publishedAt.getTime()).toBe(NOW.getTime());
    });

    test.each([
      'centro_2026103118050_DIRECCION.xml',
      'centro_20261031180509_.xml',
      'centro_20261031180509_DIRECCION.xml.DIRECCION-12.tmp',
      'otro.xml',
      'centro_20261031180509_DIRECCION.XML.bak'
    ])('should not take %s for a publication', (name) => {
      expect(parsePublishedName(name)).toBeNull();
    });
  });

  describe('publishXml()', () => {
    test('should create Centro and write the XML byte for byte', async () => {
      const result = await publishXml(repositoryPath, XML, { now: NOW, team: 'DIRECCION' });

      expect(result).toEqual({ fileName: 'centro_20261031180509_DIRECCION.xml', published: true });
      expect(fs.readFileSync(path.join(centroPath, result.fileName)).equals(XML)).toBe(true);
    });

    test('should leave no temporary file behind', async () => {
      await publishXml(repositoryPath, XML, { now: NOW, team: 'DIRECCION' });

      expect(centroFiles()).toEqual(['centro_20261031180509_DIRECCION.xml']);
    });

    test('should not publish again an XML that is already there, whoever published it', async () => {
      await publishXml(repositoryPath, XML, { now: NOW, team: 'DIRECCION' });

      const later = new Date(2026, 10, 2, 9, 0, 0);
      const again = await publishXml(repositoryPath, XML, { now: later, team: 'PC-FOTOS' });

      expect(again).toEqual({ fileName: 'centro_20261031180509_DIRECCION.xml', published: false });
      expect(centroFiles()).toHaveLength(1);
    });

    test('should publish a different XML of the same size', async () => {
      const sameSize = Buffer.from(XML.toString().replace('2026', '2027'));
      expect(sameSize.length).toBe(XML.length);

      await publishXml(repositoryPath, XML, { now: NOW, team: 'DIRECCION' });
      const result = await publishXml(repositoryPath, sameSize, { now: new Date(2026, 10, 1), team: 'DIRECCION' });

      expect(result.published).toBe(true);
      expect(centroFiles()).toHaveLength(2);
    });

    test('should never overwrite a file, even in the same second', async () => {
      await publishXml(repositoryPath, XML, { now: NOW, team: 'DIRECCION' });
      const second = await publishXml(repositoryPath, OTHER, { now: NOW, team: 'DIRECCION' });

      expect(second.fileName).toBe('centro_20261031180510_DIRECCION.xml');
      expect(fs.readFileSync(path.join(centroPath, 'centro_20261031180509_DIRECCION.xml')).equals(XML)).toBe(true);
    });

    test('should ignore files in Centro that are not publications', async () => {
      fs.mkdirSync(centroPath);
      fs.writeFileSync(path.join(centroPath, 'notas.xml'), XML);

      const result = await publishXml(repositoryPath, XML, { now: NOW, team: 'DIRECCION' });

      expect(result.published).toBe(true);
      expect(fs.readFileSync(path.join(centroPath, 'notas.xml')).equals(XML)).toBe(true);
    });
  });

  describe('the applied XML in project_settings', () => {
    test('should read nothing on a project from before it was recorded', async () => {
      expect(await getAppliedXml(makeDb())).toBeNull();
    });

    test('should read nothing from an unreadable value', async () => {
      expect(await getAppliedXml(makeDb({ sharedXml: '{not json' }))).toBeNull();
      expect(await getAppliedXml(makeDb({ sharedXml: '{"fileName":"x"}' }))).toBeNull();
    });

    test('should read back what was stored', async () => {
      const db = makeDb();
      const value = { hash: hashXml(XML), fileName: null, appliedAt: NOW.toISOString() };

      await setAppliedXml(db, value);

      expect(await getAppliedXml(db)).toEqual(value);
    });
  });

  describe('publishAppliedXml()', () => {
    let xmlPath;
    let db;

    beforeEach(async () => {
      xmlPath = path.join(root, 'usuarios.xml');
      fs.writeFileSync(xmlPath, XML);
      db = makeDb();
      await setAppliedXml(db, { hash: hashXml(XML), fileName: null, appliedAt: NOW.toISOString() });
    });

    const publish = (overrides = {}) => publishAppliedXml({
      dbManager: db,
      repositoryPath,
      xmlPath,
      options: { now: NOW, team: 'DIRECCION' },
      ...overrides
    });

    test('should publish and remember the file name', async () => {
      const result = await publish();

      expect(result).toEqual({ status: 'published', fileName: 'centro_20261031180509_DIRECCION.xml' });
      expect((await getAppliedXml(db)).fileName).toBe('centro_20261031180509_DIRECCION.xml');
    });

    test('should take an XML another team already published as its own', async () => {
      await publishXml(repositoryPath, XML, { now: new Date(2026, 9, 30), team: 'PC-FOTOS' });

      const result = await publish();

      expect(result.status).toBe('already');
      expect((await getAppliedXml(db)).fileName).toBe('centro_20261030000000_PC-FOTOS.xml');
      expect(centroFiles()).toHaveLength(1);
    });

    test('should not publish on a project that never recorded what it applied', async () => {
      expect((await publish({ dbManager: makeDb() })).status).toBe('not-applied');
      expect(centroFiles()).toEqual([]);
    });

    test('should not publish without a repository', async () => {
      expect((await publish({ repositoryPath: null })).status).toBe('no-repository');
    });

    test('should not publish to a repository that is not there', async () => {
      const missing = path.join(root, 'G-desconectada');

      expect((await publish({ repositoryPath: missing })).status).toBe('repository-unavailable');
      expect(fs.existsSync(missing)).toBe(false);
    });

    test('should not publish a file that changed since it was applied', async () => {
      fs.writeFileSync(xmlPath, OTHER);

      expect((await publish()).status).toBe('changed');
      expect(centroFiles()).toEqual([]);
    });

    test('should not publish a file that is gone', async () => {
      fs.rmSync(xmlPath);

      expect((await publish()).status).toBe('changed');
    });

    test('should report a write that fails instead of throwing', async () => {
      // A file where the folder should be
      fs.writeFileSync(centroPath, '');

      const result = await publish();

      expect(result.status).toBe('failed');
      expect(result.error).toEqual(expect.any(String));
      expect((await getAppliedXml(db)).fileName).toBeNull();
    });
  });

  describe('publishProjectXml()', () => {
    test('should publish the XML the project recorded, read from its xmlFilePath', async () => {
      const xmlPath = path.join(root, 'usuarios.xml');
      fs.writeFileSync(xmlPath, XML);
      const db = makeDb({ xmlFilePath: xmlPath });
      await setAppliedXml(db, { hash: hashXml(XML), fileName: null, appliedAt: NOW.toISOString() });

      const result = await publishProjectXml(db, repositoryPath);

      expect(result.status).toBe('published');
      expect(centroFiles()).toEqual([result.fileName]);
    });

    test('should report a failure reading the settings instead of throwing', async () => {
      const db = makeDb();
      db.getProjectSetting.mockRejectedValue(new Error('database is closed'));

      await expect(publishProjectXml(db, repositoryPath))
        .resolves.toEqual({ status: 'failed', error: 'database is closed' });
    });
  });

  describe('readCourse()', () => {
    const write = (content) => {
      const filePath = path.join(root, `curso-${Math.random()}.xml`);
      fs.writeFileSync(filePath, content);
      return filePath;
    };

    test('should read the course from the centro start tag', async () => {
      await expect(readCourse(write('<?xml version="1.0"?>\n<centro codigo="46000" curso="2026">')))
        .resolves.toBe(2026);
    });

    test('should accept single quotes and attributes on several lines', async () => {
      await expect(readCourse(write("<centro\n  codigo='46000'\n  curso='2025'>"))).resolves.toBe(2025);
    });

    test('should read nothing from a file without a course', async () => {
      await expect(readCourse(write('<centro codigo="46000"><grupos curso="2026"/></centro>'))).resolves.toBeNull();
    });

    test('should not take an attribute that only ends in curso', async () => {
      await expect(readCourse(write('<centro precurso="2026">'))).resolves.toBeNull();
    });
  });

  describe('findNewerXml()', () => {
    const xmlFor = (course, extra = '') => Buffer.from(`<?xml version="1.0"?><centro curso="${course}">${extra}</centro>`);
    const publishAt = (content, date, team = 'DIRECCION') =>
      publishXml(repositoryPath, content, { now: date, team }).then((r) => r.fileName);
    const appliedFrom = (content, fileName, appliedAt = NOW) =>
      ({ hash: hashXml(content), fileName, appliedAt: appliedAt.toISOString() });
    const find = (applied, extra = {}) => findNewerXml({ repositoryPath, academicYear: 2026, applied, ...extra });

    const OCT = new Date(2026, 9, 1, 9, 0, 0);
    const NOV = new Date(2026, 10, 3, 9, 0, 0);
    const DEC = new Date(2026, 11, 1, 9, 0, 0);

    test('should find nothing when there is no Centro folder', async () => {
      await expect(find(null)).resolves.toBeNull();
    });

    test('should offer a later publication of the same course, with who and when', async () => {
      const mine = await publishAt(xmlFor(2026), OCT);
      const theirs = await publishAt(xmlFor(2026, '<alumnos/>'), NOV, 'PC-FOTOS');

      const newer = await find(appliedFrom(xmlFor(2026), mine));

      expect(newer).toEqual({
        fileName: theirs,
        filePath: path.join(centroPath, theirs),
        publishedAt: NOV.toISOString(),
        team: 'PC-FOTOS',
        academicYear: 2026
      });
    });

    test('should find nothing when what the project applied is the latest', async () => {
      await publishAt(xmlFor(2026, '<alumnos/>'), OCT);
      const mine = await publishAt(xmlFor(2026), NOV);

      await expect(find(appliedFrom(xmlFor(2026), mine))).resolves.toBeNull();
    });

    test('should not offer another course, but still the latest of its own behind it', async () => {
      const mine = await publishAt(xmlFor(2026), OCT);
      const ownCourse = await publishAt(xmlFor(2026, '<alumnos/>'), NOV);
      await publishAt(xmlFor(2027), DEC);

      await expect(find(appliedFrom(xmlFor(2026), mine))).resolves.toEqual(expect.objectContaining({ fileName: ownCourse }));
    });

    test('should offer nothing to a project of a previous course opened on purpose', async () => {
      const mine = await publishAt(xmlFor(2025), OCT);
      await publishAt(xmlFor(2026), NOV);

      await expect(find(appliedFrom(xmlFor(2025), mine), { academicYear: 2025 })).resolves.toBeNull();
    });

    test('should skip a publication without a course', async () => {
      const mine = await publishAt(xmlFor(2026), OCT);
      await publishAt(Buffer.from('<centro><alumnos/></centro>'), NOV);

      await expect(find(appliedFrom(xmlFor(2026), mine))).resolves.toBeNull();
    });

    test('should not offer a later copy of the same content', async () => {
      // Two teams published the same XML before either saw the other's
      fs.mkdirSync(centroPath);
      fs.writeFileSync(path.join(centroPath, 'centro_20261103090000_PC-FOTOS.xml'), xmlFor(2026));
      const mine = await publishAt(xmlFor(2026), OCT);

      await expect(find(appliedFrom(xmlFor(2026), mine))).resolves.toBeNull();
    });

    test('should compare with the date it was applied when it was never published', async () => {
      await publishAt(xmlFor(2026, '<alumnos/>'), OCT);
      const later = await publishAt(xmlFor(2026, '<docentes/>'), DEC);

      const applied = appliedFrom(xmlFor(2026), null, NOV);

      await expect(find(applied)).resolves.toEqual(expect.objectContaining({ fileName: later }));
    });

    describe('a project from before 1.25, which never recorded what it applied', () => {
      test('should offer the latest of its course', async () => {
        const latest = await publishAt(xmlFor(2026), NOV);

        await expect(find(null)).resolves.toEqual(expect.objectContaining({ fileName: latest }));
      });

      test('should not offer the XML it already has', async () => {
        await publishAt(xmlFor(2026), NOV);

        await expect(find(null, { currentHash: hashXml(xmlFor(2026)) })).resolves.toBeNull();
      });
    });
  });
});
