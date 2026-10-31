// @ts-check
// verbose() captures a stack trace for every statement to improve error
// messages. Worth it while developing, pure overhead in a release build.
const sqlite3 = process.argv.includes('--dev')
  ? require('sqlite3').verbose()
  : require('sqlite3');
const path = require('path');
const { compareUsersByName } = require('./utils/nameOrder');

/**
 * Lowercase and without accents, so "José" and "jose" compare equal
 * @param {*} value
 * @returns {string}
 */
function foldText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

class DatabaseManager {
  constructor(dbPath) {
    this.db = null;
    this.dbPath = dbPath;
  }

  /** @returns {Promise<void>} */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          reject(err);
        } else {
          this.db.run('PRAGMA journal_mode = WAL');
          // With WAL, NORMAL drops the fsync on every commit while still being
          // crash safe: only a power loss can lose the most recent commits, and
          // the database itself cannot be corrupted.
          this.db.run('PRAGMA synchronous = NORMAL');
          try {
            await this.createTables();
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  }

  /** @returns {Promise<void>} */
  async createTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Groups table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL
          )
        `);

        // Users table
        this.db.run(`
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
          )
        `);

        // Image tags table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS image_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_path TEXT NOT NULL,
            tag TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Project settings table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS project_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Image relationships backup table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS image_relationships_backup (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            backup_date TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            image_path TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create indexes for performance optimization
        this.db.run('CREATE INDEX IF NOT EXISTS idx_users_group ON users(group_code)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_users_type ON users(type)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_users_nia ON users(nia)');

        // Staff are looked up by document as often as students are by NIA
        this.db.run('CREATE INDEX IF NOT EXISTS idx_users_document ON users(document)');

        // Replaced: it served an ORDER BY on the names, but SQLite compares
        // bytes, so users are now sorted in JavaScript (utils/nameOrder.js)
        this.db.run('DROP INDEX IF EXISTS idx_users_name');

        // Replaced: it was meant for search, but searches use LIKE '%term%',
        // which no index can serve, so it only cost time on every insert
        this.db.run('DROP INDEX IF EXISTS idx_users_search');

        // Index for image path lookups (optimizes linking and unlinking operations)
        this.db.run('CREATE INDEX IF NOT EXISTS idx_users_image ON users(image_path)');

        this.db.run('CREATE INDEX IF NOT EXISTS idx_image_tags_path ON image_tags(image_path)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_backup_date ON image_relationships_backup(backup_date)');

        // Add orla_paid column if it doesn't exist (for backward compatibility)
        this.db.run(`
          ALTER TABLE users ADD COLUMN orla_paid INTEGER DEFAULT 0
        `, (err) => {
          // Ignore error if column already exists
          if (err && !err.message.includes('duplicate column')) {
            reject(err);
            return;
          }

          // Add receipt_printed column if it doesn't exist (for backward compatibility)
          this.db.run(`
            ALTER TABLE users ADD COLUMN receipt_printed INTEGER DEFAULT 0
          `, (err) => {
            // Ignore error if column already exists
            if (err && !err.message.includes('duplicate column')) {
              reject(err);
              return;
            }

            // When the captured photo was last linked (ISO, UTC), to sort the
            // list by it. Kept when the photo is unlinked, as exporting to the
            // repository does; links made before this column have none
            this.db.run(`
              ALTER TABLE users ADD COLUMN image_linked_at TEXT
            `, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        });
      });
    });
  }

  async importUsers(users) {
    return new Promise((resolve, reject) => {
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
          const withoutGroup = occurrences.filter(occ => !occ.user.group_code || occ.user.group_code === '');

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
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // Insert groups
        const insertGroup = this.db.prepare('INSERT OR IGNORE INTO groups (code, name) VALUES (?, ?)');
        users.groups.forEach(group => {
          insertGroup.run(group.code, group.name);
        });
        insertGroup.finalize();

        // Insert special groups
        this.db.run('INSERT OR IGNORE INTO groups (code, name) VALUES (?, ?)', ['DOCENTES', 'Docentes']);
        this.db.run('INSERT OR IGNORE INTO groups (code, name) VALUES (?, ?)', ['NO_DOCENTES', 'No Docentes']);
        this.db.run('INSERT OR IGNORE INTO groups (code, name) VALUES (?, ?)', ['SIN_GRUPO', '⚠ Sin grupo']);

        // Insert users
        const insertUser = this.db.prepare(
          'INSERT INTO users (type, first_name, last_name1, last_name2, birth_date, document, nia, group_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        for (const [identifier, userData] of usersToImport) {
          const user = userData.user;
          const type = userData.type;

          insertUser.run(
            type,
            user.first_name,
            user.last_name1,
            user.last_name2,
            user.birth_date,
            user.document,
            type === 'student' ? user.nia : null,
            user.group_code
          );
          report.imported++;
        }

        insertUser.finalize();

        this.db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve(report);
        });
      });
    });
  }

  async getUsers(filters = {}) {
    return new Promise((resolve, reject) => {
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

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const users = filters.search ? rows.filter(matchesSearch(filters.search)) : rows;
        resolve(users.sort(compareUsersByName));
      });
    });
  }

  async getUserById(userId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getUsersByIds(userIds) {
    return new Promise((resolve, reject) => {
      if (!userIds || userIds.length === 0) {
        resolve([]);
        return;
      }

      const placeholders = userIds.map(() => '?').join(',');
      const query = `SELECT * FROM users WHERE id IN (${placeholders})`;

      this.db.all(query, userIds, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async getUserByNIA(nia) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.*, g.name as group_name
        FROM users u
        LEFT JOIN groups g ON u.group_code = g.code
        WHERE u.nia = ?
      `;
      this.db.get(query, [nia], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getUserByDocument(document) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.*, g.name as group_name
        FROM users u
        LEFT JOIN groups g ON u.group_code = g.code
        WHERE u.document = ?
      `;
      this.db.get(query, [document], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
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

      const rows = await new Promise((resolve, reject) => {
        this.db.all(
          `SELECT u.*, g.name as group_name
           FROM users u
           LEFT JOIN groups g ON u.group_code = g.code
           WHERE u.nia IN (${placeholders}) OR u.document IN (${placeholders})`,
          [...chunk, ...chunk],
          (err, found) => {
            if (err) reject(err);
            else resolve(found || []);
          }
        );
      });

      results.push(...rows);
    }

    return results;
  }

  async getGroups() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM groups ORDER BY code', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getUsersByImagePath(imagePath) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM users WHERE image_path = ?', [imagePath], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * @returns {Promise<string>} When it was linked, as stored in image_linked_at
   */
  async linkImageToUser(userId, imagePath) {
    const linkedAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET image_path = ?, image_linked_at = ? WHERE id = ?',
        [imagePath, linkedAt, userId],
        (err) => {
          if (err) reject(err);
          else resolve(linkedAt);
        }
      );
    });
  }

  /** @returns {Promise<void>} */
  async unlinkImageFromUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE users SET image_path = NULL WHERE id = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** @returns {Promise<void>} */
  async updateUser(userId, updates) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      // Build update query dynamically based on provided fields
      if (updates.first_name !== undefined) {
        fields.push('first_name = ?');
        values.push(updates.first_name);
      }
      if (updates.last_name1 !== undefined) {
        fields.push('last_name1 = ?');
        values.push(updates.last_name1);
      }
      if (updates.last_name2 !== undefined) {
        fields.push('last_name2 = ?');
        values.push(updates.last_name2);
      }
      if (updates.birth_date !== undefined) {
        fields.push('birth_date = ?');
        values.push(updates.birth_date);
      }
      if (updates.document !== undefined) {
        fields.push('document = ?');
        values.push(updates.document);
      }
      if (updates.group_code !== undefined) {
        fields.push('group_code = ?');
        values.push(updates.group_code);
      }
      if (updates.nia !== undefined) {
        fields.push('nia = ?');
        values.push(updates.nia);
      }

      if (fields.length === 0) {
        resolve(); // Nothing to update
        return;
      }

      values.push(userId); // Add userId for WHERE clause
      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, values, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** @returns {Promise<void>} */
  async deleteUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** @returns {Promise<void>} */
  async addImageTag(imagePath, tag) {
    return new Promise((resolve, reject) => {
      this.db.run('INSERT INTO image_tags (image_path, tag) VALUES (?, ?)', [imagePath, tag], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getImageTags(imagePath) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM image_tags WHERE image_path = ? ORDER BY created_at DESC', [imagePath], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /** @returns {Promise<void>} */
  async deleteImageTag(tagId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM image_tags WHERE id = ?', [tagId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getAllImagesWithTags() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT DISTINCT image_path
        FROM image_tags
        ORDER BY image_path
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Counts describing the contents of the project
   *
   * Everything is counted in SQL rather than by loading the rows: a project
   * holds thousands of users, and this only needs the totals.
   *
   * @returns {Promise<Object>} totals, plus usersByType keyed by user type
   */
  async getProjectStatistics() {
    const totals = await new Promise((resolve, reject) => {
      this.db.get(`
        SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN image_path IS NOT NULL AND image_path != '' THEN 1 ELSE 0 END) AS usersWithImage
        FROM users
      `, [], (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });

    const byType = await new Promise((resolve, reject) => {
      this.db.all(`
        SELECT type, COUNT(*) AS count
        FROM users
        GROUP BY type
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const groups = await new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) AS count FROM groups', [], (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });

    const taggedImages = await new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(DISTINCT image_path) AS count FROM image_tags',
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || {});
        }
      );
    });

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
    const rows = await new Promise((resolve, reject) => {
      this.db.all(`
        SELECT
          COALESCE(u.group_code, '') AS code,
          g.name AS name,
          u.type, u.nia, u.document, u.image_path
        FROM users u
        LEFT JOIN groups g ON u.group_code = g.code
        WHERE COALESCE(u.group_code, '') != 'ELIMINADOS'
        ORDER BY code
      `, [], (err, result) => {
        if (err) reject(err);
        else resolve(result || []);
      });
    });

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

  // Project settings methods
  async getProjectSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT value FROM project_settings WHERE key = ?
      `, [key], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.value : null);
      });
    });
  }

  /** @returns {Promise<void>} */
  async setProjectSetting(key, value) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR REPLACE INTO project_settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
      `, [key, value], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** @returns {Promise<void>} */
  async deleteProjectSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM project_settings WHERE key = ?
      `, [key], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Orla payment methods
  /** @returns {Promise<void>} */
  async markOrlaPaid(userId, isPaid) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE users SET orla_paid = ? WHERE id = ?', [isPaid ? 1 : 0, userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getOrlaPaidStatus(userId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT orla_paid FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.orla_paid === 1 : false);
      });
    });
  }

  // Receipt printing methods
  /** @returns {Promise<void>} */
  async markReceiptPrinted(userId, isPrinted) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE users SET receipt_printed = ? WHERE id = ?', [isPrinted ? 1 : 0, userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getReceiptPrintedStatus(userId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT receipt_printed FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.receipt_printed === 1 : false);
      });
    });
  }

  // Image relationships backup methods
  async backupUserImageRelationships() {
    return new Promise((resolve, reject) => {
      const backupDate = new Date().toISOString();
      console.log('[Database] Creating backup with date:', backupDate);

      this.db.serialize(() => {
        // Get all users with image_path
        this.db.all(
          'SELECT id, image_path FROM users WHERE image_path IS NOT NULL AND image_path != ""',
          [],
          (err, users) => {
            if (err) {
              console.error('[Database] Error getting users for backup:', err);
              reject(err);
              return;
            }

            console.log('[Database] Found users with images:', users.length);
            if (users.length > 0) {
              console.log('[Database] Sample user:', users[0]);
            }

            if (users.length === 0) {
              resolve({ backupDate, count: 0 });
              return;
            }

            // One transaction for the batch. Without it each row commits on its
            // own, which means a disk flush per relationship.
            this.db.run('BEGIN TRANSACTION');

            const stmt = this.db.prepare(
              'INSERT INTO image_relationships_backup (backup_date, user_id, image_path) VALUES (?, ?, ?)'
            );

            let completed = 0;
            let hasError = false;

            users.forEach(user => {
              stmt.run([backupDate, user.id, user.image_path], (err) => {
                if (err && !hasError) {
                  console.error('[Database] Error inserting backup:', err);
                  hasError = true;
                  stmt.finalize();
                  this.db.run('ROLLBACK', () => reject(err));
                  return;
                }

                completed++;
                if (completed === users.length && !hasError) {
                  stmt.finalize();
                  this.db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      reject(commitErr);
                      return;
                    }
                    console.log('[Database] Successfully backed up', users.length, 'relationships');
                    resolve({ backupDate, count: users.length });
                  });
                }
              });
            });
          }
        );
      });
    });
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

    return new Promise((resolve, reject) => {
      let query = 'UPDATE users SET image_path = NULL WHERE image_path IS NOT NULL AND image_path != ""';
      const params = [];

      if (restricted) {
        query += ` AND id IN (${userIds.map(() => '?').join(',')})`;
        params.push(...userIds);
      }

      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ cleared: this.changes });
      });
    });
  }

  async restoreUserImageRelationships(backupDate) {
    return new Promise((resolve, reject) => {
      console.log('[Database] Restoring from backup date:', backupDate);

      this.db.serialize(() => {
        // Get all backed up relationships for this date
        this.db.all(
          'SELECT user_id, image_path FROM image_relationships_backup WHERE backup_date = ?',
          [backupDate],
          (err, backups) => {
            if (err) {
              console.error('[Database] Error getting backups:', err);
              reject(err);
              return;
            }

            console.log('[Database] Found backups:', backups.length);
            if (backups.length > 0) {
              console.log('[Database] Sample backup:', backups[0]);
            }

            if (backups.length === 0) {
              resolve({ restored: 0 });
              return;
            }

            // First, clear current image paths
            this.db.run('UPDATE users SET image_path = NULL', [], (err) => {
              if (err) {
                console.error('[Database] Error clearing image paths:', err);
                reject(err);
                return;
              }

              console.log('[Database] Cleared existing image paths');

              // One transaction for the batch, as with the backup above
              this.db.run('BEGIN TRANSACTION');

              const stmt = this.db.prepare('UPDATE users SET image_path = ? WHERE id = ?');
              let completed = 0;
              let hasError = false;

              backups.forEach(backup => {
                stmt.run([backup.image_path, backup.user_id], (err) => {
                  if (err && !hasError) {
                    console.error('[Database] Error restoring backup:', err);
                    hasError = true;
                    stmt.finalize();
                    this.db.run('ROLLBACK', () => reject(err));
                    return;
                  }

                  completed++;
                  if (completed === backups.length && !hasError) {
                    stmt.finalize();
                    this.db.run('COMMIT', (commitErr) => {
                      if (commitErr) {
                        reject(commitErr);
                        return;
                      }
                      console.log('[Database] Successfully restored', backups.length, 'relationships');
                      resolve({ restored: backups.length });
                    });
                  }
                });
              });
            });
          }
        );
      });
    });
  }

  async getBackups() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT backup_date, COUNT(*) as count, MIN(created_at) as created_at
         FROM image_relationships_backup
         GROUP BY backup_date
         ORDER BY backup_date DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async deleteBackup(backupDate) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM image_relationships_backup WHERE backup_date = ?',
        [backupDate],
        function(err) {
          if (err) reject(err);
          else resolve({ deleted: this.changes });
        }
      );
    });
  }

  /**
   * Close the database connection
   *
   * sqlite3 closes asynchronously and keeps the file locked until it finishes,
   * so reopening a project must await this before opening the new connection.
   *
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve();
        return;
      }

      const db = this.db;
      this.db = null;

      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        }
        resolve();
      });
    });
  }
}

module.exports = DatabaseManager;
