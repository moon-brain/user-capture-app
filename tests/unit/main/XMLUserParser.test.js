/**
 * XMLUserParser tests
 *
 * The XML is the source of truth for every user in a project, so a parsing
 * mistake propagates into the database and from there into carnets. The tags
 * and attribute names are fixed by the source file format and are deliberately
 * in Spanish; these tests pin them down so a rename cannot pass unnoticed.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const XMLUserParser = require('../../../src/main/xmlParser');

describe('XMLUserParser', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-xml-tests');
  let testId = 0;

  const parseXml = async (xml) => {
    testId++;
    const filePath = path.join(fixturesPath, `centro-${testId}.xml`);
    fs.writeFileSync(filePath, xml, 'utf8');
    return new XMLUserParser(filePath).parse();
  };

  beforeAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true });
    fs.mkdirSync(fixturesPath, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.useRealTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('structure', () => {
    test('should reject a file without the centro root', async () => {
      await expect(parseXml('<?xml version="1.0"?><otracosa></otracosa>')).rejects.toThrow(
        /XML/
      );
    });

    test('should reject malformed XML instead of reading what it can', async () => {
      await expect(parseXml('<centro><grupos>')).rejects.toThrow(/no es válido/);
    });

    test('should reject a truncated file rather than import it partially', async () => {
      // The dangerous case: a half-written file parses into a smaller school,
      // and an XML update would treat everyone missing from it as deleted
      const truncated = `
        <centro>
          <alumnos>
            <alumno nombre="ANA" apellido1="GARCIA" NIA="1" grupo="1ESOA"/>
      `;

      await expect(parseXml(truncated)).rejects.toThrow(/no es válido/);
    });

    test('should say where the file is broken', async () => {
      await expect(parseXml('<centro><grupos>')).rejects.toThrow(/línea/);
    });

    test('should reject a file that does not exist', async () => {
      const parser = new XMLUserParser(path.join(fixturesPath, 'missing.xml'));

      await expect(parser.parse()).rejects.toThrow();
    });

    test('should reject an empty centro rather than report a school with nobody in it', async () => {
      await expect(parseXml('<centro></centro>')).rejects.toThrow(/ningún usuario/);
    });

    test('should reject a centro with its attributes but nothing inside', async () => {
      // A real export always carries attributes on the root, so the element
      // itself is never empty: the check has to be on who was read
      const xml = '<centro codigo="46016397" denominacion="IES PRUEBA" curso="2026" version="1.0"></centro>';

      await expect(parseXml(xml)).rejects.toThrow(/ningún usuario/);
    });

    test('should reject a file with groups but no users', async () => {
      // Applied as an update, it would delete everyone in the project
      const xml = '<centro codigo="1"><grupos><grupo codigo="1ESOA" nombre="Primero ESO A"/></grupos></centro>';

      await expect(parseXml(xml)).rejects.toThrow(/ningún usuario/);
    });

    test('should accept a file with only staff', async () => {
      const result = await parseXml('<centro codigo="1"><docentes><docente nombre="MARIA" documento="D1"/></docentes></centro>');

      expect(result.teachers).toHaveLength(1);
    });
  });

  describe('grupos', () => {
    test('should read code and name', async () => {
      const result = await parseXml(`
        <centro>
          <grupos>
            <grupo codigo="1ESOA" nombre="Primero ESO A"/>
            <grupo codigo="2BACB" nombre="Segundo Bachillerato B"/>
          </grupos>
          <alumnos><alumno nombre="ANA" NIA="1" grupo="1ESOA"/></alumnos>
        </centro>
      `);

      expect(result.groups).toEqual([
        { code: '1ESOA', name: 'Primero ESO A' },
        { code: '2BACB', name: 'Segundo Bachillerato B' }
      ]);
    });

    test('should handle a single group not being an array', async () => {
      // fast-xml-parser collapses a lone element into an object
      const result = await parseXml(
        '<centro><grupos><grupo codigo="1ESOA" nombre="Primero ESO A"/></grupos>' +
        '<alumnos><alumno nombre="ANA" NIA="1" grupo="1ESOA"/></alumnos></centro>'
      );

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].code).toBe('1ESOA');
    });

    test('should skip a group missing its code or name', async () => {
      const result = await parseXml(`
        <centro>
          <grupos>
            <grupo codigo="1ESOA" nombre="Primero ESO A"/>
            <grupo codigo="2ESOB"/>
            <grupo nombre="Sin codigo"/>
          </grupos>
          <alumnos><alumno nombre="ANA" NIA="1" grupo="1ESOA"/></alumnos>
        </centro>
      `);

      expect(result.groups).toHaveLength(1);
    });
  });

  describe('alumnos', () => {
    const studentsXml = `
      <centro>
        <alumnos>
          <alumno nombre="ANA" apellido1="GARCIA" apellido2="LOPEZ"
                  fecha_nac="2008-05-12" documento="12345678Z" NIA="10785059" grupo="1ESOA"/>
          <alumno nombre="LUIS" apellido1="PEREZ" NIA="10785060" grupo="2BACB"/>
        </alumnos>
      </centro>
    `;

    test('should read every documented field', async () => {
      const [ana] = (await parseXml(studentsXml)).students;

      expect(ana).toEqual({
        first_name: 'ANA',
        last_name1: 'GARCIA',
        last_name2: 'LOPEZ',
        birth_date: '2008-05-12',
        document: '12345678Z',
        nia: '10785059',
        group_code: '1ESOA'
      });
    });

    test('should default missing optional fields rather than drop the student', async () => {
      const [, luis] = (await parseXml(studentsXml)).students;

      expect(luis.last_name2).toBe('');
      expect(luis.document).toBe('');
      expect(luis.birth_date).toBeNull();
      expect(luis.first_name).toBe('LUIS');
    });

    test('should keep the group each student belongs to', async () => {
      const { students } = await parseXml(studentsXml);

      expect(students.map(s => s.group_code)).toEqual(['1ESOA', '2BACB']);
    });

    test('should leave the group null when the XML omits it', async () => {
      const result = await parseXml(
        '<centro><alumnos><alumno nombre="SIN" apellido1="GRUPO" NIA="1"/></alumnos></centro>'
      );

      expect(result.students[0].group_code).toBeNull();
    });

    test('should handle a single student not being an array', async () => {
      const result = await parseXml(
        '<centro><alumnos><alumno nombre="ANA" apellido1="GARCIA" NIA="1"/></alumnos></centro>'
      );

      expect(result.students).toHaveLength(1);
    });
  });

  describe('identifiers', () => {
    const zerosXml = `
      <centro>
        <grupos><grupo codigo="101" nombre="Aula 101"/></grupos>
        <alumnos>
          <alumno nombre="ANA" apellido1="GARCIA" NIA="0123456" documento="01234567" grupo="101"/>
        </alumnos>
        <docentes>
          <docente nombre="MARIA" apellido1="RUIZ" documento="00012345"/>
        </docentes>
      </centro>
    `;

    test('should keep the leading zeros of an NIA', async () => {
      const [ana] = (await parseXml(zerosXml)).students;

      expect(ana.nia).toBe('0123456');
    });

    test('should keep the leading zeros of a document made only of digits', async () => {
      const result = await parseXml(zerosXml);

      expect(result.students[0].document).toBe('01234567');
      expect(result.teachers[0].document).toBe('00012345');
    });

    test('should read values that look like numbers as text', async () => {
      const result = await parseXml(zerosXml);

      expect(result.groups[0].code).toBe('101');
      expect(result.students[0].group_code).toBe('101');
    });
  });

  describe('docentes and no_docentes', () => {
    const staffXml = `
      <centro>
        <docentes>
          <docente nombre="MARIA" apellido1="RUIZ" apellido2="SOLER"
                   fecha_nac="1975-03-02" documento="020429642F"/>
        </docentes>
        <no_docentes>
          <no_docente nombre="JUAN" apellido1="MARTIN" documento="020237952E"/>
        </no_docentes>
      </centro>
    `;

    test('should read teachers with their document', async () => {
      const [teacher] = (await parseXml(staffXml)).teachers;

      expect(teacher).toEqual({
        first_name: 'MARIA',
        last_name1: 'RUIZ',
        last_name2: 'SOLER',
        birth_date: '1975-03-02',
        document: '020429642F'
      });
    });

    test('should read non-teaching staff separately from teachers', async () => {
      const result = await parseXml(staffXml);

      expect(result.teachers).toHaveLength(1);
      expect(result.nonTeachingStaff).toHaveLength(1);
      expect(result.nonTeachingStaff[0].document).toBe('020237952E');
    });

    test('should not give staff a NIA or a group', async () => {
      const [teacher] = (await parseXml(staffXml)).teachers;

      // Staff are placed in the Docentes / No Docentes groups later, not here
      expect(teacher.nia).toBeUndefined();
      expect(teacher.group_code).toBeUndefined();
    });
  });

  describe('the course', () => {
    test('should read the year it starts from the centro element', async () => {
      const result = await parseXml(
        '<centro codigo="46016397" curso="2026" fechaExportacion="18/09/2026 18:27:34">' +
        '<alumnos><alumno nombre="ANA" NIA="1"/></alumnos></centro>'
      );

      expect(result.academicYear).toBe(2026);
    });

    test('should leave it empty when the file does not say', async () => {
      const result = await parseXml('<centro><alumnos><alumno nombre="ANA" NIA="1"/></alumnos></centro>');

      expect(result.academicYear).toBeNull();
    });

    test('should leave it empty rather than guess from a value it does not understand', async () => {
      const result = await parseXml('<centro curso="2026/27"><alumnos><alumno nombre="ANA" NIA="1"/></alumnos></centro>');

      expect(result.academicYear).toBeNull();
    });
  });

  describe('a complete file', () => {
    test('should keep the four collections apart', async () => {
      const result = await parseXml(`
        <centro>
          <grupos><grupo codigo="1ESOA" nombre="Primero ESO A"/></grupos>
          <alumnos>
            <alumno nombre="ANA" apellido1="GARCIA" NIA="1" grupo="1ESOA"/>
            <alumno nombre="LUIS" apellido1="PEREZ" NIA="2" grupo="1ESOA"/>
          </alumnos>
          <docentes><docente nombre="MARIA" apellido1="RUIZ" documento="D1"/></docentes>
          <no_docentes><no_docente nombre="JUAN" apellido1="MARTIN" documento="D2"/></no_docentes>
        </centro>
      `);

      expect(result.groups).toHaveLength(1);
      expect(result.students).toHaveLength(2);
      expect(result.teachers).toHaveLength(1);
      expect(result.nonTeachingStaff).toHaveLength(1);
    });

    test('should accept accents and ñ in names', async () => {
      const result = await parseXml(
        '<centro><alumnos><alumno nombre="JOSÉ" apellido1="MUÑOZ" apellido2="PEÑA" NIA="1"/></alumnos></centro>'
      );

      expect(result.students[0].first_name).toBe('JOSÉ');
      expect(result.students[0].last_name1).toBe('MUÑOZ');
      expect(result.students[0].last_name2).toBe('PEÑA');
    });
  });

  // The entity decoding was rewritten in fast-xml-parser 5.6-5.7; names are
  // matched against photos and carnets, so a character read differently would
  // be a different person
  describe('escaped characters', () => {
    const student = (attributes) => parseXml(
      `<centro><alumnos><alumno ${attributes} NIA="1"/></alumnos></centro>`
    ).then((result) => result.students[0]);

    test('should decode the five XML entities', async () => {
      const result = await student('nombre="Mª &quot;Pepa&quot;" apellido1="O&apos;Brien" apellido2="Pérez &amp; &lt;Ruiz&gt;"');

      expect(result.first_name).toBe('Mª "Pepa"');
      expect(result.last_name1).toBe("O'Brien");
      expect(result.last_name2).toBe('Pérez & <Ruiz>');
    });

    test('should decode decimal and hexadecimal character references', async () => {
      // fast-xml-parser leaves them as written unless HTML entities are on
      const result = await student('nombre="&#209;uria" apellido1="Pe&#xF1;a" apellido2="Ib&#225;&#xf1;ez"');

      expect(result.first_name).toBe('Ñuria');
      expect(result.last_name1).toBe('Peña');
      expect(result.last_name2).toBe('Ibáñez');
    });

    test('should decode a reference to a markup character without breaking the file', async () => {
      const result = await student('nombre="Pérez &#38; Hijos" apellido1="&#60;Ruiz&#62;" apellido2="O&#39;Brien &#34;Jr&#34;"');

      expect(result.first_name).toBe('Pérez & Hijos');
      expect(result.last_name1).toBe('<Ruiz>');
      expect(result.last_name2).toBe('O\'Brien "Jr"');
    });

    test('should keep the text "&#209;" when it was written escaped', async () => {
      const result = await student('nombre="&amp;#209;"');

      expect(result.first_name).toBe('&#209;');
    });

    test('should decode references in the identifiers too', async () => {
      const result = await parseXml(
        '<centro><docentes><docente nombre="Ana" apellido1="Ruiz" documento="&#49;2345678&#90;"/></docentes></centro>'
      );

      expect(result.teachers[0].document).toBe('12345678Z');
    });

    test('should leave an HTML-only entity as it is written', async () => {
      // &ntilde; is not an XML entity: the school's export never writes it,
      // and guessing would hide a broken file
      const result = await student('nombre="Mu&ntilde;oz"');

      expect(result.first_name).toBe('Mu&ntilde;oz');
    });

    describe('decodeCharacterReferences()', () => {
      const { decodeCharacterReferences: decode } = XMLUserParser;

      test('should turn references into characters, astral ones included', () => {
        expect(decode('&#209;&#xd1;&#xD1;&#128512;')).toBe('ÑÑÑ😀');
      });

      test('should leave what is not a reference alone', () => {
        expect(decode('&amp;#209; &#; &#x; &#12a; &X#41; &#X41;')).toBe('&amp;#209; &#; &#x; &#12a; &X#41; &#X41;');
      });

      test('should leave references to characters XML does not allow', () => {
        expect(decode('&#0; &#1; &#xD800; &#xFFFE; &#1114112;')).toBe('&#0; &#1; &#xD800; &#xFFFE; &#1114112;');
      });

      test('should write the markup characters as named entities', () => {
        expect(decode('&#38;&#60;&#62;&#34;&#39;&#x26;')).toBe('&amp;&lt;&gt;&quot;&apos;&amp;');
      });

      test('should not touch CDATA sections or comments', () => {
        const xml = '<a>&#209;<![CDATA[&#209;]]><!-- &#209; -->&#209;</a>';
        expect(decode(xml)).toBe('<a>Ñ<![CDATA[&#209;]]><!-- &#209; -->Ñ</a>');
      });

      test('should keep tabs and line breaks, which XML allows', () => {
        expect(decode('a&#9;b&#10;c&#13;d')).toBe('a\tb\nc\rd');
      });
    });

    test('should keep a line break inside a value', async () => {
      const result = await student('nombre="Ana\nMaría"');

      expect(result.first_name).toBe('Ana\nMaría');
    });
  });
});
