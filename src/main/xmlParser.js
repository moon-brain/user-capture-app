// @ts-check
const fs = require('fs');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { parseAcademicYear } = require('./academicYear');

const NO_USERS = 'El archivo XML no contiene ningún usuario (alumnos, docentes ni no docentes)';

// The five characters that mean something in XML go back as their named
// entity, which the parser decodes; written raw they would break the markup
const MARKUP = { 34: '&quot;', 38: '&amp;', 39: '&apos;', 60: '&lt;', 62: '&gt;' };

/**
 * Whether XML 1.0 allows this character in a document
 * @param {number} code
 * @returns {boolean}
 */
function isXmlChar(code) {
  return code === 0x9 || code === 0xA || code === 0xD ||
    (code >= 0x20 && code <= 0xD7FF) ||
    (code >= 0xE000 && code <= 0xFFFD) ||
    (code >= 0x10000 && code <= 0x10FFFF);
}

/**
 * Turn the numeric character references (&#209; or &#xD1;) into the
 * characters they stand for
 *
 * They are standard XML, but fast-xml-parser only decodes them together with
 * the HTML entities (its htmlEntities option, deprecated in v5), so "Pe&#241;a"
 * came out as written. This runs on the text before parsing:
 *
 * - "&amp;#209;", someone writing the text "&#209;", is left alone: in the raw
 *   file there is no "&#" there;
 * - references to the markup characters become their named entity;
 * - a reference to a character XML does not allow is left as written;
 * - CDATA sections and comments are not touched, their content is literal.
 *
 * @param {string} xml
 * @returns {string}
 */
function decodeCharacterReferences(xml) {
  return xml.replace(
    /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|&#(?:([0-9]+)|x([0-9a-fA-F]+));/g,
    (match, decimal, hex) => {
      if (decimal === undefined && hex === undefined) return match;
      const code = decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex, 16);
      if (!isXmlChar(code)) return match;
      return MARKUP[code] || String.fromCodePoint(code);
    }
  );
}

class XMLUserParser {
  constructor(xmlPath) {
    this.xmlPath = xmlPath;
    // Every attribute is kept as text. Converting the ones that look like
    // numbers turned an NIA or document such as "0123456" into 123456, and the
    // photos named after the real identifier were then never found.
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: false
    });
  }

  async parse() {
    try {
      const xmlData = fs.readFileSync(this.xmlPath, 'utf8');

      // Validate before parsing. The parser is lenient: given a truncated file
      // it returns whatever it managed to read, so a half-downloaded XML would
      // import as a smaller school, and an update would then treat every user
      // it could not see as deleted.
      const validation = XMLValidator.validate(xmlData);
      if (validation !== true) {
        const { line, col, msg } = validation.err;
        throw new Error(`El archivo XML no es válido (línea ${line}, columna ${col}): ${msg}`);
      }

      // Validated as the file is, so a reported line and column point at it
      const jsonData = this.parser.parse(decodeCharacterReferences(xmlData));

      const result = {
        groups: [],
        students: [],
        teachers: [],
        nonTeachingStaff: [],
        // Year the course starts, from <centro curso="2026">; null if absent
        academicYear: null
      };

      // NOTE: XML tags are in Spanish as per source file specification
      // Tags: grupos, alumnos, docentes, no_docentes
      // Fields are XML attributes, not child nodes

      if (!('centro' in jsonData)) {
        throw new Error('El archivo no tiene el elemento <centro> que envuelve los datos del centro');
      }

      const centro = jsonData.centro;

      if (!centro || typeof centro !== 'object') {
        throw new Error(NO_USERS);
      }

      result.academicYear = parseAcademicYear(centro['@_curso']);

      // Parse groups (grupos)
      if (centro.grupos && centro.grupos.grupo) {
        result.groups = this.parseGroups(centro.grupos.grupo);
      }

      // Parse students (alumnos)
      if (centro.alumnos && centro.alumnos.alumno) {
        result.students = this.parseStudents(centro.alumnos.alumno);
      }

      // Parse teachers (docentes)
      if (centro.docentes && centro.docentes.docente) {
        result.teachers = this.parseTeachers(centro.docentes.docente);
      }

      // Parse non-teaching staff (no_docentes)
      if (centro.no_docentes && centro.no_docentes.no_docente) {
        result.nonTeachingStaff = this.parseNonTeachingStaff(centro.no_docentes.no_docente);
      }

      // A roll with nobody in it is almost always a wrong or cut-down export,
      // and accepting it would let an update empty the whole project. Checked
      // on what was read, not on the element: a real <centro> always carries
      // attributes (codigo, curso...), so it is never empty as an element.
      const totalUsers = result.students.length + result.teachers.length + result.nonTeachingStaff.length;
      if (totalUsers === 0) {
        throw new Error(NO_USERS);
      }

      return result;
    } catch (error) {
      console.error('Error parsing XML:', error);
      throw new Error('No se pudo procesar el archivo XML: ' + error.message);
    }
  }

  parseGroups(groupsData) {
    const groups = [];
    const groupArray = Array.isArray(groupsData) ? groupsData : [groupsData];

    groupArray.forEach(group => {
      // XML attributes are prefixed with @_
      if (group && group['@_codigo'] && group['@_nombre']) {
        groups.push({
          code: group['@_codigo'],
          name: group['@_nombre']
        });
      }
    });

    return groups;
  }

  parseStudents(studentsData) {
    const students = [];
    const studentArray = Array.isArray(studentsData) ? studentsData : [studentsData];

    studentArray.forEach(student => {
      if (student) {
        students.push({
          first_name: student['@_nombre'] || '',
          last_name1: student['@_apellido1'] || '',
          last_name2: student['@_apellido2'] || '',
          birth_date: student['@_fecha_nac'] || null,
          document: student['@_documento'] || '',
          nia: student['@_NIA'] || null,
          group_code: student['@_grupo'] || null
        });
      }
    });

    return students;
  }

  parseTeachers(teachersData) {
    const teachers = [];
    const teacherArray = Array.isArray(teachersData) ? teachersData : [teachersData];

    teacherArray.forEach(teacher => {
      if (teacher) {
        teachers.push({
          first_name: teacher['@_nombre'] || '',
          last_name1: teacher['@_apellido1'] || '',
          last_name2: teacher['@_apellido2'] || '',
          birth_date: teacher['@_fecha_nac'] || null,
          document: teacher['@_documento'] || ''
        });
      }
    });

    return teachers;
  }

  parseNonTeachingStaff(staffData) {
    const staff = [];
    const staffArray = Array.isArray(staffData) ? staffData : [staffData];

    staffArray.forEach(person => {
      if (person) {
        staff.push({
          first_name: person['@_nombre'] || '',
          last_name1: person['@_apellido1'] || '',
          last_name2: person['@_apellido2'] || '',
          birth_date: person['@_fecha_nac'] || null,
          document: person['@_documento'] || ''
        });
      }
    });

    return staff;
  }
}

module.exports = Object.assign(XMLUserParser, { decodeCharacterReferences });
