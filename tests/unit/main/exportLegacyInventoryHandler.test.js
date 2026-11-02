/**
 * export-legacy-inventory-csv handler tests
 *
 * Inventario Legacy imports Grupos.csv, Matrícula.csv and Personal.csv as the
 * school management system lists them, so their shape is a contract: the
 * exact headers, Windows-1252 text, CRLF line ends and quotes only where a
 * field needs them. Part of what goes in them is not kept by the project and
 * comes from its XML. Students who have left are not exported.
 *
 * The project is built here as the application builds it, from an XML with
 * the parser and importUsers().
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../../src/main/database');
const XMLUserParser = require('../../../src/main/xmlParser');
const { hashXml, publishXml } = require('../../../src/main/sharedXml');

const mockHandlers = new Map();
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockHandlers.set(channel, handler))
  }
}));

const { registerExportHandlers } = require('../../../src/main/ipc/exportHandlers');
const { encodeWindows1252, tutorName } = require('../../../src/main/legacyInventory');

const logger = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  section: jest.fn()
};

// Invented people, in the shape of the school's XML
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<centro codigo="46000000" curso="2026">
  <grupos>
    <grupo codigo="1ESOA" nombre="ESO1EA" capacidad="30" tutor_ppal="12345678Z" oficial="S" turno="D" ensenanza="3"/>
    <grupo codigo="2BACA" nombre="BTX2BA" capacidad="35" tutor_ppal="" oficial="N" turno="D" ensenanza="4"/>
  </grupos>
  <alumnos>
    <alumno NIA="0012345" nombre="Begoña" apellido1="Núñez" apellido2="Pérez" fecha_nac="14/02/2012" sexo="M" documento="" estado_matricula="M" fecha_matricula="01/07/2026" grupo="1ESOA"/>
    <alumno NIA="10000002" nombre="Luis" apellido1="Zapata" apellido2="Ruiz" fecha_nac="20/11/2008" sexo="H" documento="Y0000000Z" estado_matricula="M" fecha_matricula="02/07/2026" grupo="2BACA"/>
    <alumno NIA="10000003" nombre="Iñaki" apellido1="Sáez" apellido2="" fecha_nac="01/09/2012" sexo="H" documento="" estado_matricula="B" fecha_matricula="03/07/2026" grupo="1ESOA"/>
    <alumno NIA="10000004" nombre="Marta" apellido1="Ibáñez" apellido2="" fecha_nac="30/12/2011" sexo="M" documento="" estado_matricula="M" fecha_matricula="04/07/2026" grupo=""/>
  </alumnos>
  <docentes>
    <docente nombre="María José" apellido1="Ruiz" apellido2="Llorens" documento="12345678Z" fecha_nac="10/06/1975" telefono1="600000000"/>
  </docentes>
  <no_docentes>
    <no_docente nombre="Pedro" apellido1="Gómez, hijo" apellido2="" documento="X1234567L" fecha_nac="22/01/1980"/>
  </no_docentes>
</centro>`;

describe('export-legacy-inventory-csv handler', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-legacy-inventory-tests');
  let testId = 0;
  let projectPath;
  let repositoryPath;
  let exportPath;
  let xmlPath;
  let db;
  let state;

  const runExport = (options) => mockHandlers.get('export-legacy-inventory-csv')({}, exportPath, options);

  /** @returns {string[][]} the rows, header first, read as Windows-1252 */
  const readCsv = (fileName) => {
    const text = fs.readFileSync(path.join(exportPath, fileName), 'latin1');
    expect(text.endsWith('\r\n')).toBe(true);
    return text.slice(0, -2).split('\r\n').map(parseLine);
  };

  /** One CSV line into its fields, quotes undone */
  const parseLine = (line) => {
    const fields = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quoted) {
        if (char === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { fields.push(field); field = ''; }
      else field += char;
    }
    fields.push(field);
    return fields;
  };

  const rowOf = (fileName, first) => readCsv(fileName).find((row) => row[0] === first);

  beforeAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.mkdirSync(fixturesPath, { recursive: true });

    state = { dbManager: null, projectPath: null };
    registerExportHandlers({
      mainWindow: () => null,
      logger,
      state,
      repositoryMirror: () => null
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
    repositoryPath = path.join(fixturesPath, `repository-${testId}`);
    exportPath = path.join(fixturesPath, `export-${testId}`);
    xmlPath = path.join(fixturesPath, `centro-${testId}.xml`);
    for (const folder of [projectPath, repositoryPath, exportPath]) {
      fs.mkdirSync(folder, { recursive: true });
    }
    fs.writeFileSync(xmlPath, XML, 'utf8');

    db = new DatabaseManager(path.join(projectPath, 'users.db'));
    await db.initialize();
    await db.importUsers(await new XMLUserParser(xmlPath).parse());
    await db.setProjectSetting('imageRepositoryPath', repositoryPath);
    await db.setProjectSetting('xmlFilePath', xmlPath);
    await db.setProjectSetting('sharedXml', JSON.stringify({
      hash: hashXml(fs.readFileSync(xmlPath)), fileName: null, appliedAt: new Date().toISOString()
    }));

    state.dbManager = db;
    state.projectPath = projectPath;
  });

  afterEach(async () => {
    await db.close();
  });

  describe('the files', () => {
    test('should write the three files with the headers of the management system', async () => {
      const result = await runExport({});

      expect(result.success).toBe(true);
      expect(readCsv('Grupos.csv')[0]).toEqual(
        ['Código', 'Nombre', 'Prog. Ling.', 'Capaci.', 'Tot.Act.', 'Tutor', 'Turno', 'Dictamen', 'Oficial', 'Ense.']);
      expect(readCsv('Matrícula.csv')[0]).toEqual(['NIA', 'Nombre', 'Apellido1', 'Apellido2', 'Fecha Nacimiento',
        'Sexo', 'Documento', 'Estado', 'F. Matricula', 'Enseñanza', 'Ciclo FP/Prog. PFCB', 'Curso', 'Grupo']);
      expect(readCsv('Personal.csv')[0]).toEqual(['TIPO', 'DOCUMENTO', 'NOMBRE', 'APELLIDO 1', 'APELLIDO 2',
        'F. NACIMIENTO', 'TELÉFONO 1', 'TELÉFONO 2', 'GRUPO', 'CARGO']);
    });

    test('should write Windows-1252 with CRLF, as the system lists them', async () => {
      await runExport({});

      const bytes = fs.readFileSync(path.join(exportPath, 'Grupos.csv'));
      // "Código": ó is one byte, 0xF3, not UTF-8's two
      expect([...bytes.subarray(0, 6)]).toEqual([0x43, 0xF3, 0x64, 0x69, 0x67, 0x6F]);
      expect(bytes.toString('latin1').split('\r\n').every((line) => !line.includes('\n'))).toBe(true);
      expect(rowOf('Matrícula.csv', '0012345').slice(1, 4)).toEqual(['Begoña', 'Núñez', 'Pérez']);
    });

    test('should quote only the fields with a comma', async () => {
      await runExport({});

      const text = fs.readFileSync(path.join(exportPath, 'Personal.csv'), 'latin1');
      expect(text).toContain(',"Gómez, hijo",');
      expect(text).not.toContain('"Pedro"');
    });
  });

  describe('Grupos.csv', () => {
    test('should list the school groups with capacity, current total, tutor and official', async () => {
      await runExport({});

      expect(rowOf('Grupos.csv', '1ESOA')).toEqual(['1ESOA', 'ESO1EA', '', '30', '1', 'Ruiz Llorens, María José', '', '', 'Si', '']);
      expect(rowOf('Grupos.csv', '2BACA')).toEqual(['2BACA', 'BTX2BA', '', '35', '1', '', '', '', 'No', '']);
    });

    test('should leave out the application\'s own groups', async () => {
      await runExport({});

      expect(readCsv('Grupos.csv').slice(1).map((row) => row[0]).sort()).toEqual(['1ESOA', '2BACA']);
    });
  });

  describe('Matrícula.csv', () => {
    test('should fill in sex, status and enrolment date from the XML', async () => {
      await runExport({});

      expect(rowOf('Matrícula.csv', '10000002')).toEqual(['10000002', 'Luis', 'Zapata', 'Ruiz', '20/11/2008', 'Hombre',
        'Y0000000Z', 'Matriculado', '02/07/2026', '', '', '', '2BACA']);
    });

    test('should leave out the students who have left, and say how many', async () => {
      const result = await runExport({});

      expect(rowOf('Matrícula.csv', '10000003')).toBeUndefined();
      expect(result.results.leftOut).toBe(1);
      expect(result.users.map((user) => user.nia || user.document)).not.toContain('10000003');
    });

    test('should leave the group empty for a student without one', async () => {
      await runExport({});

      expect(rowOf('Matrícula.csv', '10000004')[12]).toBe('');
    });

    test('should leave out the users in Eliminados', async () => {
      const [luis] = (await db.getUsers({})).filter((user) => user.nia === '10000002');
      await db.updateUser(luis.id, { group_code: 'ELIMINADOS' });

      const result = await runExport({});

      expect(rowOf('Matrícula.csv', '10000002')).toBeUndefined();
      expect(result.results.leftOut).toBe(1);
    });
  });

  describe('Personal.csv', () => {
    test('should give the type and the group each person tutors', async () => {
      await runExport({});

      expect(rowOf('Personal.csv', 'Docente')).toEqual(
        ['Docente', '12345678Z', 'María José', 'Ruiz', 'Llorens', '10/06/1975', '', '', '1ESOA', '']);
      expect(rowOf('Personal.csv', 'No Docente').slice(0, 2)).toEqual(['No Docente', 'X1234567L']);
    });
  });

  describe('a single group', () => {
    test('should export its group and students, and count the totals over the project', async () => {
      const result = await runExport({ groupCode: '1ESOA' });

      expect(readCsv('Grupos.csv').slice(1).map((row) => row[0])).toEqual(['1ESOA']);
      expect(readCsv('Matrícula.csv').slice(1).map((row) => row[0])).toEqual(['0012345']);
      expect(readCsv('Personal.csv')).toHaveLength(1);
      expect(result.users.map((user) => user.nia)).toEqual(['0012345']);
    });

    test('should refuse a group with nobody in it', async () => {
      const result = await runExport({ groupCode: 'NADIE' });

      expect(result.success).toBe(false);
      expect(fs.readdirSync(exportPath)).toEqual([]);
    });
  });

  describe('the XML the project was built from', () => {
    test('should use the copy in Centro when the original is gone', async () => {
      const { fileName } = await publishXml(repositoryPath, fs.readFileSync(xmlPath));
      await db.setProjectSetting('sharedXml', JSON.stringify({
        hash: hashXml(fs.readFileSync(xmlPath)), fileName, appliedAt: new Date().toISOString()
      }));
      fs.rmSync(xmlPath);

      const result = await runExport({});

      expect(result.success).toBe(true);
      expect(rowOf('Matrícula.csv', '10000002')[5]).toBe('Hombre');
    });

    test('should export nothing, and say why, when no copy of it is left', async () => {
      fs.writeFileSync(xmlPath, XML.replace('capacidad="30"', 'capacidad="31"'), 'utf8');

      const result = await runExport({});

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Actualizar archivo XML/);
      expect(fs.readdirSync(exportPath)).toEqual([]);
    });
  });

  test('should refuse to run without an open project', async () => {
    state.dbManager = null;

    expect((await runExport({})).success).toBe(false);
  });
});

describe('legacyInventory helpers', () => {
  test('encodeWindows1252() should keep the letters the system can hold and mark the rest', () => {
    expect([...encodeWindows1252('ñÑ€’')]).toEqual([0xF1, 0xD1, 0x80, 0x92]);
    expect(encodeWindows1252('漢').toString('latin1')).toBe('?');
  });

  test('tutorName() should write surnames first, as the system names tutors', () => {
    expect(tutorName({ first_name: 'Ana', last_name1: 'Gil', last_name2: '' })).toBe('Gil, Ana');
  });
});
