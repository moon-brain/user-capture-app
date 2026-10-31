// @ts-check
/**
 * The project database (data/users.db)
 *
 * This is the only module that talks to SQLite (dependencyBoundaries.test.js
 * checks it). It uses node:sqlite, the SQLite built into Node, which Electron
 * brings with it: no native module to download or rebuild, and the SQLite
 * version moves with Electron. Until 1.24 it used the sqlite3 package, which
 * was archived in July 2026; the files are the same, and the projects those
 * versions wrote are opened by compatibility.test.js.
 *
 * node:sqlite is synchronous. The methods keep returning promises, as they
 * did with sqlite3, so callers did not change; queries here are over a few
 * thousand rows at most and take milliseconds.
 *
 * Differences from sqlite3 that this module evens out:
 * - foreign keys are off, as sqlite3 had them: users.group_code may name a
 *   group the XML did not list;
 * - undefined is stored as NULL and booleans as 1/0, which sqlite3 did and
 *   node:sqlite refuses (see bindable());
 * - rows are plain objects, not objects without a prototype;
 * - string literals go in single quotes: double quotes are identifiers.
 */
const { DatabaseSync } = require('node:sqlite');
const { compareUsersByName } = require('./utils/nameOrder');

/**
 * Lowercase and without accents, so "José" and "jose" compare equal
 * @param {*} value
 * @returns {string}
 */
function foldText(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Filter for the user search box
 *
 * Done here rather than with SQL LIKE, which only ignores case for plain
 * ASCII letters: every word typed has to appear in the name, a surname, the
 * NIA or the document, ignoring case and accents. "ana garcia" finds Ana
 * García, and staff can be found by their DNI.
 *
 * @param {string} search
 * @returns {(user: Object) => boolean} Predicate for a user row
 */
function matchesSearch(search) {
  const words = foldText(search).split(/\s+/).filter(Boolean);
  return (user) => {
    const text = foldText([user.first_name, user.last_name1, user.last_name2, user.nia, user.document].join(' '));
    return words.every(word => text.includes(word));
  };
}

/**
 * A parameter as sqlite3 stored it: undefined as NULL, booleans as 1 or 0
 * @param {*} value
 * @returns {import('node:sqlite').SQLInputValue}
 */
function bindable(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/** @param {Array<*>} params */
const bindAll = (params) => params.map(bindable);

/**
 * @param {Object|undefined} row
 * @returns {Object|undefined}
 */
const plain = (row) => (row ? { ...row } : row);

// Columns added after the first version, in order. Projects from any earlier
// version get the ones they lack when they are opened
const ADDED_USER_COLUMNS = [
  ['orla_paid', 'INTEGER DEFAULT 0'],
  ['receipt_printed', 'INTEGER DEFAULT 0'],
  // When the captured photo was last linked (ISO, UTC), to sort the list by
  // it. Kept when the photo is unlinked, as exporting to the repository does;
  // links made before this column have none
  ['image_linked_at', 'TEXT']
];

class DatabaseManager {
  constructor(dbPath) {
    /** @type {DatabaseSync|null} */
    this.db = null;
    this.dbPath = dbPath;
  }

  // --- Queries ---------------------------------------------------------------

  /**
   * @param {string} sql
   * @param {Array<*>} [params]
   * @returns {Array<Object>}
   */
  all(sql, params = []) {
    return this.db.prepare(sql).all(...bindAll(params)).map(plain);
  }

  /**
   * @param {string} sql
   * @param {Array<*>} [params]
   * @returns {Object|undefined}
   */
  get(sql, params = []) {
    return plain(this.db.prepare(sql).get(...bindAll(params)));
  }

  /**
   * @param {string} sql
   * @param {Array<*>} [params]
   * @returns {{changes: number}}
   */
  run(sql, params = []) {
    const result = this.db.prepare(sql).run(...bindAll(params));
    return { changes: Number(result.changes) };
  }

  /**
   * Run the writes in one transaction: all of them or none, and one disk
   * flush for the batch instead of one per row
   * @template T
   * @param {() => T} write
   * @returns {T}
   */
  transaction(write) {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const result = write();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // --- Opening ---------------------------------------------------------------

  /** @returns {Promise<void>} */
  async initialize() {
    this.db = new DatabaseSync(this.dbPath, { enableForeignKeyConstraints: false });
    try {
      this.db.exec('PRAGMA journal_mode = WAL');
      // With WAL, NORMAL drops the fsync on every commit while still being
      // crash safe: only a power loss can lose the most recent commits, and
      // the database itself cannot be corrupted.
      this.db.exec('PRAGMA synchronous = NORMAL');
      await this.createTables();
    } catch (error) {
      this.db.close();
      this.db = null;
      throw error;
    }
  }

  /** @returns {Promise<void>} */
  async createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name1 TEXT NOT NULL,
        last_name2 TEXT,
        birth_date TEXT,
        document TEXT,
        nia TEXT,
        group_code TEXT,
        image_path TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_code) REFERENCES groups(code)
      );

      CREATE TABLE IF NOT EXISTS image_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_path TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS project_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS image_relationships_backup (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_date TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_group ON users(group_code);
      CREATE INDEX IF NOT EXISTS idx_users_type ON users(type);
      CREATE INDEX IF NOT EXISTS idx_users_nia ON users(nia);
      -- Staff are looked up by document as often as students are by NIA
      CREATE INDEX IF NOT EXISTS idx_users_document ON users(document);

      -- Replaced: it served an ORDER BY on the names, but SQLite compares
      -- bytes, so users are now sorted in JavaScript (utils/nameOrder.js)
      DROP INDEX IF EXISTS idx_users_name;
      -- Replaced: it was meant for search, but searches use LIKE '%term%',
      -- which no index can serve, so it only cost time on every insert
      DROP INDEX IF EXISTS idx_users_search;

      -- Linking and unlinking look users up by their photo
      CREATE INDEX IF NOT EXISTS idx_users_image ON users(image_path);
      CREATE INDEX IF NOT EXISTS idx_image_tags_path ON image_tags(image_path);
      CREATE INDEX IF NOT EXISTS idx_backup_date ON image_relationships_backup(backup_date);
    `);

    // Asked rather than inferred from the "duplicate column" error, whose
    // wording is SQLite's and not part of any contract
    const existing = new Set(this.all('PRAGMA table_info(users)').map((column) => column.name));
    for (const [name, definition] of ADDED_USER_COLUMNS) {
      if (!existing.has(name)) {
        this.db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      }
    }
  }

  // --- Users and groups ------------------------------------------------------

  async importUsers(users) {
    // Track issues during import
    const report = {
      imported: 0,
      withoutIdentifier: [],
      withoutGroup: [],
      duplicates: []
    };

    // Pre-process all users and resolve duplicates
    // Map: identifier -> { user: userData, fullName: string }
    const usersToImport = new Map();

    // Helper function to collect all occurrences of each identifier
    const userOccurrences = new Map(); // identifier -> array of occurrences

    const collectUser = (user, type, defaultGroup) => {
      const fullName = `${user.first_name} ${user.last_name1} ${user.last_name2 || ''}`.trim();

      // Determine identifier based on type
      let identifier, identifierLabel;
      if (type === 'student') {
        if (!user.nia) {
          report.withoutIdentifier.push({
            type: 'Estudiante',
            name: fullName,
            group: user.group_code || 'Sin grupo',
            document: user.document || 'Sin documento',
            reason: 'Sin NIA'
          });
          return; // Skip this user
        }
        identifier = `student_${user.nia}`;
        identifierLabel = `NIA: ${user.nia}`;
      } else {
        if (!user.document) {
          report.withoutIdentifier.push({
            type: type === 'teacher' ? 'Docente' : 'No Docente',
            name: fullName,
            group: defaultGroup,
            document: 'Sin documento',
            reason: 'Sin documento'
          });
          return; // Skip this user
        }
        identifier = `${type}_${user.document}`;
        identifierLabel = `Documento: ${user.document}`;
      }

      // Assign default group for teachers/staff, keep as-is for students
      const groupCode = type === 'student' ? user.group_code : (user.group_code || defaultGroup);

      // Collect this occurrence
      if (!userOccurrences.has(identifier)) {
        userOccurrences.set(identifier, []);
      }
      userOccurrences.get(identifier).push({
        user: { ...user, group_code: groupCode },
        fullName: fullName,
        type: type,
        identifierLabel: identifierLabel
      });
    };

    // Collect all students
    users.students.forEach(student => {
      collectUser(student, 'student', student.group_code);
    });

    // Collect all teachers
    users.teachers.forEach(teacher => {
      collectUser(teacher, 'teacher', 'DOCENTES');
    });

    // Collect all non-teaching staff
    users.nonTeachingStaff.forEach(staff => {
      collectUser(staff, 'non_teaching_staff', 'NO_DOCENTES');
    });

    // Now process all collected occurrences and decide which to import
    for (const [identifier, occurrences] of userOccurrences) {
      if (occurrences.length === 1) {
        // Single occurrence - check if it has a group
        const occurrence = occurrences[0];
        const hasGroup = occurrence.user.group_code && occurrence.user.group_code !== '';

        // If no group, assign to SIN_GRUPO
        if (!hasGroup) {
          occurrence.user.group_code = 'SIN_GRUPO';
        }

        usersToImport.set(identifier, occurrence);

        if (!hasGroup && occurrence.type === 'student') {
          // Student without group and no duplicates
          report.withoutGroup.push({
            type: 'Estudiante',
            name: occurrence.fullName,
            identifier: occurrence.identifierLabel,
            document: occurrence.user.document || 'Sin documento',
            note: 'No existen grupos asignados'
          });
        }
      } else {
        // Multiple occurrences - duplicates detected
        const userType = occurrences[0].type === 'student' ? 'Estudiante' :
                        (occurrences[0].type === 'teacher' ? 'Docente' : 'No Docente');

        // Analyze groups in all occurrences
        const withGroup = occurrences.filter(occ => occ.user.group_code && occ.user.group_code !== '');

        let selectedOccurrence;
        let duplicateNote;

        if (withGroup.length === 0) {
          // No occurrence has a group - assign to SIN_GRUPO
          selectedOccurrence = occurrences[0];
          selectedOccurrence.user.group_code = 'SIN_GRUPO';
          duplicateNote = 'No existen grupos asignados';

          // Add to withoutGroup report
          report.withoutGroup.push({
            type: userType,
            name: selectedOccurrence.fullName,
            identifier: selectedOccurrence.identifierLabel,
            document: selectedOccurrence.user.document || 'Sin documento',
            note: 'No existen grupos asignados'
          });
        } else if (withGroup.length === 1) {
          // One occurrence has group, others don't
          selectedOccurrence = withGroup[0];
          duplicateNote = `Importado en el grupo ${selectedOccurrence.user.group_code}`;
        } else {
          // Multiple occurrences with different groups
          selectedOccurrence = withGroup[0];
          const groups = withGroup.map(occ => occ.user.group_code).filter((v, i, a) => a.indexOf(v) === i);
          if (groups.length > 1) {
            duplicateNote = `Usuario asignado a más de un grupo. Importado en el grupo ${selectedOccurrence.user.group_code}`;
          } else {
            duplicateNote = `Importado en el grupo ${selectedOccurrence.user.group_code}`;
          }
        }

        // Import the selected occurrence
        usersToImport.set(identifier, selectedOccurrence);

        // Collect all unique group codes found in occurrences
        const allGroups = occurrences
          .map(occ => occ.user.group_code || 'Sin grupo')
          .filter((v, i, a) => a.indexOf(v) === i) // unique values
          .join(', ');

        // Report all duplicates in one consolidated entry
        report.duplicates.push({
          type: userType,
          identifier: selectedOccurrence.identifierLabel,
          allNames: occurrences.map(o => o.fullName).join(', '),
          allGroups: allGroups,
          group: selectedOccurrence.user.group_code || 'Sin grupo',
          note: duplicateNote,
          occurrencesCount: occurrences.length,
          processed: true
        });
      }
    }

    // Now import the selected users
    this.transaction(() => {
      const insertGroup = this.db.prepare('INSERT OR IGNORE INTO groups (code, name) VALUES (?, ?)');
      for (const group of users.groups) {
        insertGroup.run(bindable(group.code), bindable(group.name));
      }

      // Special groups
      insertGroup.run('DOCENTES', 'Docentes');
      insertGroup.run('NO_DOCENTES', 'No Docentes');
      insertGroup.run('SIN_GRUPO', '⚠ Sin grupo');

      const insertUser = this.db.prepare(
        'INSERT INTO users (type, first_name, last_name1, last_name2, birth_date, document, nia, group_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const { user, type } of usersToImport.values()) {
        insertUser.run(...bindAll([
          type,
          user.first_name,
          user.last_name1,
          user.last_name2,
          user.birth_date,
          user.document,
          type === 'student' ? user.nia : null,
          user.group_code
        ]));
        report.imported++;
      }
    });

    return report;
  }

  async getUsers(filters = {}) {
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (filters.groupCode) {
      query += ' AND group_code = ?';
      params.push(filters.groupCode);
    }

    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    const rows = this.all(query, params);
    const users = filters.search ? rows.filter(matchesSearch(filters.search)) : rows;
    return users.sort(compareUsersByName);
  }

  async getUserById(userId) {
    return this.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  async getUsersByIds(userIds) {
    if (!userIds || userIds.length === 0) {
      return [];
    }
    const placeholders = userIds.map(() => '?').join(',');
    return this.all(`SELECT * FROM users WHERE id IN (${placeholders})`, userIds);
  }

  async getUserByNIA(nia) {
    return this.get(`
      SELECT u.*, g.name as group_name
      FROM users u
      LEFT JOIN groups g ON u.group_code = g.code
      WHERE u.nia = ?
    `, [nia]);
  }

  async getUserByDocument(document) {
    return this.get(`
      SELECT u.*, g.name as group_name
      FROM users u
      LEFT JOIN groups g ON u.group_code = g.code
      WHERE u.document = ?
    `, [document]);
  }

  /**
   * Look up users by NIA or document in as few queries as possible
   *
   * Card print and publication requests are files named after an identifier.
   * Resolving them one at a time cost two queries per file.
   *
   * @param {Array<string>} identifiers - NIAs and/or documents
   * @returns {Promise<Array>} Matching users, each with group_name
   */
  async getUsersByIdentifiers(identifiers) {
    if (!identifiers || identifiers.length === 0) {
      return [];
    }

    // Each identifier is bound twice, and SQLite caps how many parameters a
    // statement may have, so long lists go in chunks
    const CHUNK_SIZE = 400;
    const results = [];

    for (let i = 0; i < identifiers.length; i += CHUNK_SIZE) {
      const chunk = identifiers.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      results.push(...this.all(
        `SELECT u.*, g.name as group_name
         FROM users u
         LEFT JOIN groups g ON u.group_code = g.code
         WHERE u.nia IN (${placeholders}) OR u.document IN (${placeholders})`,
        [...chunk, ...chunk]
      ));
    }

    return results;
  }

  async getGroups() {
    return this.all('SELECT * FROM groups ORDER BY code');
  }

  async getUsersByImagePath(imagePath) {
    return this.all('SELECT * FROM users WHERE image_path = ?', [imagePath]);
  }

  /**
   * @returns {Promise<string>} When it was linked, as stored in image_linked_at
   */
  async linkImageToUser(userId, imagePath) {
    const linkedAt = new Date().toISOString();
    this.run('UPDATE users SET image_path = ?, image_linked_at = ? WHERE id = ?', [imagePath, linkedAt, userId]);
    return linkedAt;
  }

  /** @returns {Promise<void>} */
  async unlinkImageFromUser(userId) {
    this.run('UPDATE users SET image_path = NULL WHERE id = ?', [userId]);
  }

  /** @returns {Promise<void>} */
  async updateUser(userId, updates) {
    const editable = ['first_name', 'last_name1', 'last_name2', 'birth_date', 'document', 'group_code', 'nia'];
    const fields = editable.filter((field) => updates[field] !== undefined);
    if (fields.length === 0) {
      return; // Nothing to update
    }

    this.run(
      `UPDATE users SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map((field) => updates[field]), userId]
    );
  }

  /** @returns {Promise<void>} */
  async deleteUser(userId) {
    this.run('DELETE FROM users WHERE id = ?', [userId]);
  }

  // --- Image tags ------------------------------------------------------------

  /** @returns {Promise<void>} */
  async addImageTag(imagePath, tag) {
    this.run('INSERT INTO image_tags (image_path, tag) VALUES (?, ?)', [imagePath, tag]);
  }

  async getImageTags(imagePath) {
    return this.all('SELECT * FROM image_tags WHERE image_path = ? ORDER BY created_at DESC', [imagePath]);
  }

  /** @returns {Promise<void>} */
  async deleteImageTag(tagId) {
    this.run('DELETE FROM image_tags WHERE id = ?', [tagId]);
  }

  async getAllImagesWithTags() {
    return this.all('SELECT DISTINCT image_path FROM image_tags ORDER BY image_path');
  }

  // --- Statistics ------------------------------------------------------------

  /**
   * Counts describing the contents of the project
   *
   * Everything is counted in SQL rather than by loading the rows: a project
   * holds thousands of users, and this only needs the totals.
   *
   * @returns {Promise<Object>} totals, plus usersByType keyed by user type
   */
  async getProjectStatistics() {
    const totals = this.get(`
      SELECT
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN image_path IS NOT NULL AND image_path != '' THEN 1 ELSE 0 END) AS usersWithImage
      FROM users
    `) || {};
    const byType = this.all('SELECT type, COUNT(*) AS count FROM users GROUP BY type');
    const groups = this.get('SELECT COUNT(*) AS count FROM groups') || {};
    const taggedImages = this.get('SELECT COUNT(DISTINCT image_path) AS count FROM image_tags') || {};

    const totalUsers = totals.totalUsers || 0;
    const usersWithImage = totals.usersWithImage || 0;

    return {
      totalUsers,
      usersWithImage,
      usersWithoutImage: totalUsers - usersWithImage,
      totalGroups: groups.count || 0,
      taggedImages: taggedImages.count || 0,
      usersByType: byType.reduce((acc, row) => {
        acc[row.type] = row.count;
        return acc;
      }, {})
    };
  }

  /**
   * How many users of each group have a photo
   *
   * Groups by the users' group_code rather than by the groups table, so a
   * group with nobody in it does not show up as missing photos and a code
   * with no row in groups is still counted. The deleted users' group is left
   * out: nobody is going to photograph them.
   *
   * @param {Function} [hasPhoto] - (user) => boolean, given type, nia,
   *   document and image_path. By default, whether a captured photo is linked;
   *   the repository count passes its own
   * @returns {Promise<Array<{code: string, name: string, total: number, withImage: number, withoutImage: number}>>}
   */
  async getGroupPhotoCoverage(hasPhoto = (user) => Boolean(user.image_path)) {
    const rows = this.all(`
      SELECT
        COALESCE(u.group_code, '') AS code,
        g.name AS name,
        u.type, u.nia, u.document, u.image_path
      FROM users u
      LEFT JOIN groups g ON u.group_code = g.code
      WHERE COALESCE(u.group_code, '') != 'ELIMINADOS'
      ORDER BY code
    `);

    const groups = new Map();
    for (const row of rows) {
      let group = groups.get(row.code);
      if (!group) {
        group = { code: row.code, name: row.name || row.code || 'Sin grupo', total: 0, withImage: 0 };
        groups.set(row.code, group);
      }
      group.total += 1;
      if (hasPhoto(row)) group.withImage += 1;
    }

    return Array.from(groups.values(), (group) => ({
      ...group,
      withoutImage: group.total - group.withImage
    }));
  }

  // --- Project settings ------------------------------------------------------

  async getProjectSetting(key) {
    const row = this.get('SELECT value FROM project_settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  /** @returns {Promise<void>} */
  async setProjectSetting(key, value) {
    this.run(
      "INSERT OR REPLACE INTO project_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      [key, value]
    );
  }

  /** @returns {Promise<void>} */
  async deleteProjectSetting(key) {
    this.run('DELETE FROM project_settings WHERE key = ?', [key]);
  }

  // --- Orla payments and receipts --------------------------------------------

  /** @returns {Promise<void>} */
  async markOrlaPaid(userId, isPaid) {
    this.run('UPDATE users SET orla_paid = ? WHERE id = ?', [isPaid ? 1 : 0, userId]);
  }

  async getOrlaPaidStatus(userId) {
    const row = this.get('SELECT orla_paid FROM users WHERE id = ?', [userId]);
    return row ? row.orla_paid === 1 : false;
  }

  /** @returns {Promise<void>} */
  async markReceiptPrinted(userId, isPrinted) {
    this.run('UPDATE users SET receipt_printed = ? WHERE id = ?', [isPrinted ? 1 : 0, userId]);
  }

  async getReceiptPrintedStatus(userId) {
    const row = this.get('SELECT receipt_printed FROM users WHERE id = ?', [userId]);
    return row ? row.receipt_printed === 1 : false;
  }

  // --- Backups of the image links ---------------------------------------------

  async backupUserImageRelationships() {
    const backupDate = new Date().toISOString();
    console.log('[Database] Creating backup with date:', backupDate);

    const users = this.all("SELECT id, image_path FROM users WHERE image_path IS NOT NULL AND image_path != ''");
    console.log('[Database] Found users with images:', users.length);
    if (users.length === 0) {
      return { backupDate, count: 0 };
    }

    this.transaction(() => {
      const insert = this.db.prepare(
        'INSERT INTO image_relationships_backup (backup_date, user_id, image_path) VALUES (?, ?, ?)'
      );
      for (const user of users) {
        insert.run(backupDate, user.id, user.image_path);
      }
    });

    console.log('[Database] Successfully backed up', users.length, 'relationships');
    return { backupDate, count: users.length };
  }

  /**
   * Unlink captured images from users
   *
   * @param {number[]} [userIds] - Restrict to these users. Omit to clear the
   *   whole project, which is what restoring a backup relies on.
   * @returns {Promise<{cleared: number}>}
   */
  async clearCapturedImages(userIds) {
    const restricted = Array.isArray(userIds);

    if (restricted && userIds.length === 0) {
      return { cleared: 0 };
    }

    let query = "UPDATE users SET image_path = NULL WHERE image_path IS NOT NULL AND image_path != ''";
    const params = [];

    if (restricted) {
      query += ` AND id IN (${userIds.map(() => '?').join(',')})`;
      params.push(...userIds);
    }

    return { cleared: this.run(query, params).changes };
  }

  async restoreUserImageRelationships(backupDate) {
    console.log('[Database] Restoring from backup date:', backupDate);

    const backups = this.all(
      'SELECT user_id, image_path FROM image_relationships_backup WHERE backup_date = ?',
      [backupDate]
    );
    console.log('[Database] Found backups:', backups.length);
    if (backups.length === 0) {
      return { restored: 0 };
    }

    // Clearing and restoring together: a failure halfway leaves the links as
    // they were instead of with none
    this.transaction(() => {
      this.db.exec('UPDATE users SET image_path = NULL');
      const update = this.db.prepare('UPDATE users SET image_path = ? WHERE id = ?');
      for (const backup of backups) {
        update.run(backup.image_path, backup.user_id);
      }
    });

    console.log('[Database] Successfully restored', backups.length, 'relationships');
    return { restored: backups.length };
  }

  async getBackups() {
    return this.all(`
      SELECT backup_date, COUNT(*) as count, MIN(created_at) as created_at
      FROM image_relationships_backup
      GROUP BY backup_date
      ORDER BY backup_date DESC
    `);
  }

  async deleteBackup(backupDate) {
    return { deleted: this.run('DELETE FROM image_relationships_backup WHERE backup_date = ?', [backupDate]).changes };
  }

  /**
   * Close the database connection
   *
   * Closing is immediate with node:sqlite, and SQLite folds the WAL into the
   * database file on the way. It still returns a promise, as it did when
   * sqlite3 closed asynchronously.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.db = null;

    try {
      db.close();
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
  }
}

module.exports = DatabaseManager;
