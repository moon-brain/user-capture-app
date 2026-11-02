/**
 * Files for Inventario Legacy: Grupos.csv, Matrícula.csv and Personal.csv
 *
 * That program imports the three CSV files the school management system
 * lists, with their exact headers, Windows-1252 text and CRLF line ends. The
 * photos go in a ZIP of their own, written by the usual inventory export.
 *
 * What the project does not keep (sex, enrolment status and date, a group's
 * capacity, tutor and whether it is official) comes from the XML the project
 * was built from, read with XMLUserParser.parseDetails(). Columns without a
 * source in that XML go empty: the program accepts them so.
 *
 * Students who have left (estado_matricula "B") are not exported, and neither
 * is anyone in the app's Eliminados group. Pure functions: the handler in
 * ipc/exportHandlers.js reads and writes.
 *
 * @module legacyInventory
 */

const DELETED_GROUP = 'ELIMINADOS';
const LEFT_STATUS = 'B';

const GROUP_HEADER = ['Código', 'Nombre', 'Prog. Ling.', 'Capaci.', 'Tot.Act.', 'Tutor', 'Turno', 'Dictamen', 'Oficial', 'Ense.'];
const ENROLMENT_HEADER = ['NIA', 'Nombre', 'Apellido1', 'Apellido2', 'Fecha Nacimiento', 'Sexo', 'Documento', 'Estado',
  'F. Matricula', 'Enseñanza', 'Ciclo FP/Prog. PFCB', 'Curso', 'Grupo'];
const STAFF_HEADER = ['TIPO', 'DOCUMENTO', 'NOMBRE', 'APELLIDO 1', 'APELLIDO 2', 'F. NACIMIENTO', 'TELÉFONO 1',
  'TELÉFONO 2', 'GRUPO', 'CARGO'];

const SEX = { H: 'Hombre', M: 'Mujer' };
const OFFICIAL = { S: 'Si', N: 'No' };
const STAFF_TYPE = { teacher: 'Docente', non_teaching_staff: 'No Docente' };

/**
 * @param {unknown} value
 * @returns {string} quoted only when it has to be, as in the program's files
 */
function csvField(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {Array<Array<unknown>>} rows - the header first
 * @returns {string} CRLF after every row, the last one included
 */
function toCsv(rows) {
  return rows.map((row) => row.map(csvField).join(',') + '\r\n').join('');
}

// The 27 characters Windows-1252 puts where Latin-1 has control codes
const CP1252_EXTRA = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
  0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
  0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};

/**
 * Text as Windows-1252 bytes, the encoding of the program's files
 *
 * A character it cannot hold becomes '?', as Windows itself does, rather
 * than failing the whole export over one name.
 *
 * @param {string} text
 * @returns {Buffer}
 */
function encodeWindows1252(text) {
  const bytes = [];
  for (const char of text) {
    const code = /** @type {number} */ (char.codePointAt(0));
    if (code < 0x80 || (code >= 0xA0 && code <= 0xFF)) bytes.push(code);
    else bytes.push(CP1252_EXTRA[code] ?? 0x3F);
  }
  return Buffer.from(bytes);
}

/**
 * @param {{first_name?: string, last_name1?: string, last_name2?: string}} person
 * @returns {string} "Apellido1 Apellido2, Nombre", as the program names tutors
 */
function tutorName(person) {
  const surnames = [person.last_name1, person.last_name2].filter(Boolean).join(' ');
  return [surnames, person.first_name].filter(Boolean).join(', ');
}

/**
 * @param {Object} user
 * @param {{students: Map<string, {status: string}>}} details
 * @returns {boolean} whether the student is exported
 */
function isEnrolled(user, details) {
  const detail = details.students.get(String(user.nia || ''));
  return !detail || detail.status !== LEFT_STATUS;
}

/**
 * Build the three files
 *
 * @param {Object} params
 * @param {Array<Object>} params.users - who to export, as getUsers() returns them
 * @param {Array<Object>} params.allUsers - every user in the project, to count
 *   each group's students whatever the scope
 * @param {Array<{code: string, name: string}>} params.groups - the groups to list
 * @param {Awaited<ReturnType<import('./xmlParser')['prototype']['parseDetails']>>} params.details
 * @returns {{
 *   files: Array<{fileName: string, content: Buffer, rows: number}>,
 *   exportedUsers: Array<Object>,
 *   leftOut: number
 * }} exportedUsers are the ones whose photos go in the ZIP; leftOut counts
 *   the students who have left
 */
function buildLegacyInventory({ users, allUsers, groups, details }) {
  const present = (user) => user.group_code !== DELETED_GROUP;
  const isStudent = (user) => user.type === 'student';
  const isStaff = (user) => user.type in STAFF_TYPE;

  const candidates = users.filter(present);
  const students = candidates.filter((user) => isStudent(user) && isEnrolled(user, details));
  const staff = candidates.filter(isStaff);
  const leftOut = candidates.filter(isStudent).length - students.length;

  // A group's current total is its enrolled students, in the whole project
  const enrolledByGroup = new Map();
  for (const user of allUsers) {
    if (!present(user) || !isStudent(user) || !isEnrolled(user, details)) continue;
    enrolledByGroup.set(user.group_code, (enrolledByGroup.get(user.group_code) || 0) + 1);
  }

  // The group a person tutors, by the document the XML names its tutor with
  const tutoredGroup = new Map();
  for (const [code, group] of details.groups) {
    if (group.tutorDocument && !tutoredGroup.has(group.tutorDocument)) {
      tutoredGroup.set(group.tutorDocument, code);
    }
  }

  // Only the school's groups: the app's own (Docentes, Sin grupo...) are not
  // in the XML
  const groupRows = groups
    .filter((group) => details.groups.has(group.code))
    .map((group) => {
      const detail = details.groups.get(group.code);
      const tutor = details.staff.get(detail.tutorDocument);
      return [group.code, group.name, '', detail.capacity, enrolledByGroup.get(group.code) || 0,
        tutor ? tutorName(tutor) : '', '', '', OFFICIAL[detail.official] || '', ''];
    });

  // Students outside any of the school's groups go without one
  const schoolGroup = (code) => (details.groups.has(code) ? code : '');
  const studentRows = students.map((user) => {
    const detail = details.students.get(String(user.nia || '')) || { sex: '', enrollmentDate: '' };
    return [user.nia, user.first_name, user.last_name1, user.last_name2, user.birth_date, SEX[detail.sex] || '',
      user.document, 'Matriculado', detail.enrollmentDate, '', '', '', schoolGroup(user.group_code)];
  });

  const staffRows = staff.map((user) => [STAFF_TYPE[user.type], user.document, user.first_name, user.last_name1,
    user.last_name2, user.birth_date, '', '', tutoredGroup.get(String(user.document || '')) || '', '']);

  const file = (fileName, header, rows) => ({
    fileName,
    content: encodeWindows1252(toCsv([header, ...rows])),
    rows: rows.length
  });

  return {
    files: [
      file('Grupos.csv', GROUP_HEADER, groupRows),
      file('Matrícula.csv', ENROLMENT_HEADER, studentRows),
      file('Personal.csv', STAFF_HEADER, staffRows)
    ],
    exportedUsers: [...students, ...staff],
    leftOut
  };
}

module.exports = {
  buildLegacyInventory,
  encodeWindows1252,
  toCsv,
  tutorName
};
