/**
 * DatabaseManager tests
 *
 * Uses a real sqlite file: the things worth pinning down here are the schema,
 * the pragmas and whether batched writes really commit as one, none of which a
 * mocked driver would show.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../../src/main/database');

describe('DatabaseManager', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-database-tests');
  let testId = 0;
  let db;

  const query = async (sql, params = []) => db.all(sql, params);

  const student = (nia, overrides = {}) => ({
    type: 'student',
    first_name: `Nombre${nia}`,
    last_name1: `Apellido${nia}`,
    last_name2: '',
    birth_date: '2008-01-01',
    document: '',
    nia: String(nia),
    group_code: '1ESO',
    ...overrides
  });

  const staff = (document, overrides = {}) => ({
    type: 'teacher',
    first_name: `Doc${document}`,
    last_name1: `Apellido${document}`,
    last_name2: '',
    birth_date: '1980-01-01',
    document: String(document),
    nia: '',
    ...overrides
  });

  const importUsers = (students = [], teachers = []) =>
    db.importUsers({
      groups: [{ code: '1ESO', name: 'Primero ESO' }],
      students,
      teachers,
      nonTeachingStaff: []
    });

  beforeAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.mkdirSync(fixturesPath, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  beforeEach(async () => {
    jest.useRealTimers();

    testId++;
    db = new DatabaseManager(path.join(fixturesPath, `users-${testId}.db`));
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('schema', () => {
    test('should keep the journal in WAL mode', async () => {
      const [row] = await query('PRAGMA journal_mode');

      expect(row.journal_mode).toBe('wal');
    });

    test('should not fsync on every commit', async () => {
      // NORMAL (1) is safe under WAL and avoids a disk flush per commit
      const [row] = await query('PRAGMA synchronous');

      expect(row.synchronous).toBe(1);
    });

    test('should index the identifiers users are looked up by', async () => {
      const indexes = (await query("SELECT name FROM sqlite_master WHERE type = 'index'"))
        .map(row => row.name);

      expect(indexes).toContain('idx_users_nia');
      expect(indexes).toContain('idx_users_document');
    });

    test('should drop the name index, since users are sorted in JavaScript', async () => {
      const indexes = (await query("SELECT name FROM sqlite_master WHERE type = 'index'"))
        .map(row => row.name);

      expect(indexes).not.toContain('idx_users_name');
    });

    test('should reopen a project that already has the link date column', async () => {
      await importUsers([student(1)]);
      const [user] = await db.getUsers({});
      const linkedAt = await db.linkImageToUser(user.id, 'photo.jpg');
      const file = db.dbPath;
      await db.close();

      db = new DatabaseManager(file);
      await db.initialize();

      expect((await db.getUserById(user.id)).image_linked_at).toBe(linkedAt);
    });

    test('should drop the index that could never serve a search', async () => {
      const indexes = (await query("SELECT name FROM sqlite_master WHERE type = 'index'"))
        .map(row => row.name);

      expect(indexes).not.toContain('idx_users_search');
    });
  });

  describe('getUsers() search', () => {
    const names = async (filters) => (await db.getUsers(filters)).map(u => u.first_name).sort();

    beforeEach(async () => {
      await db.importUsers({
        groups: [{ code: '1ESOA', name: 'Primero ESO A' }, { code: '2ESOB', name: 'Segundo ESO B' }],
        students: [
          { first_name: 'José', last_name1: 'García', last_name2: 'Núñez', nia: '10001', document: '12345678Z', group_code: '1ESOA', birth_date: '2010-01-01' },
          { first_name: 'ANA', last_name1: 'GARCIA', last_name2: 'LOPEZ', nia: '10002', document: '', group_code: '2ESOB', birth_date: '2010-02-02' },
          { first_name: 'LUIS', last_name1: 'PEREZ', last_name2: '', nia: '10003', document: '', group_code: '1ESOA', birth_date: '2010-03-03' }
        ],
        teachers: [
          { first_name: 'MARIA', last_name1: 'RUIZ', last_name2: '', document: '44556677K', birth_date: '1980-01-01' }
        ],
        nonTeachingStaff: []
      });
    });

    test('should ignore accents both ways', async () => {
      await expect(names({ search: 'jose' })).resolves.toEqual(['José']);
      await expect(names({ search: 'garcía' })).resolves.toEqual(['ANA', 'José']);
      await expect(names({ search: 'nunez' })).resolves.toEqual(['José']);
    });

    test('should ignore case, also on accented letters', async () => {
      await expect(names({ search: 'JOSÉ' })).resolves.toEqual(['José']);
    });

    test('should find staff by their document', async () => {
      await expect(names({ search: '44556677' })).resolves.toEqual(['MARIA']);
    });

    test('should find students by NIA or by document', async () => {
      await expect(names({ search: '10003' })).resolves.toEqual(['LUIS']);
      await expect(names({ search: '12345678z' })).resolves.toEqual(['José']);
    });

    test('should need every word, wherever each one appears', async () => {
      await expect(names({ search: 'ana garcia' })).resolves.toEqual(['ANA']);
      await expect(names({ search: 'garcia lopez' })).resolves.toEqual(['ANA']);
      await expect(names({ search: 'ana perez' })).resolves.toEqual([]);
    });

    test('should combine with the other filters', async () => {
      await expect(names({ search: 'garcia', groupCode: '1ESOA' })).resolves.toEqual(['José']);
      await expect(names({ search: 'garcia', type: 'teacher' })).resolves.toEqual([]);
    });

    test('should keep the usual order', async () => {
      const users = await db.getUsers({ search: 'a' });

      expect(users.map(u => u.first_name)).toEqual(['ANA', 'José', 'MARIA']);
    });
  });

  describe('getUsers() order', () => {
    test('should sort by surnames and name, ignoring accents, case and spaces', async () => {
      const person = (nia, first_name, last_name1, last_name2) =>
        ({ first_name, last_name1, last_name2, nia, document: '', group_code: '1ESO', birth_date: '2010-01-01' });

      await db.importUsers({
        groups: [{ code: '1ESO', name: 'Primero ESO' }],
        students: [
          person('1', 'Ana', 'Zapata', ''),
          person('2', 'Luis', 'Álvarez', 'Ruiz'),
          person('3', 'Eva', 'alvarez', 'Pérez'),
          person('4', 'Sara', 'Muñoz', ''),
          person('5', 'Pablo', 'Munuera', ''),
          person('6', 'Marta', 'de la Fuente', ''),
          person('7', 'Íker', 'Delgado', ''),
          person('8', 'Carla', 'Álvarez', 'Ruiz')
        ],
        teachers: [],
        nonTeachingStaff: []
      });

      const users = await db.getUsers();

      expect(users.map(u => u.first_name)).toEqual(
        ['Eva', 'Carla', 'Luis', 'Marta', 'Íker', 'Pablo', 'Sara', 'Ana']
      );
    });
  });

  describe('getUsersByIdentifiers()', () => {
    beforeEach(async () => {
      await importUsers(
        [student(1001), student(1002), student(1003)],
        [staff('X111'), staff('X222')]
      );
    });

    test('should find students by NIA', async () => {
      const found = await db.getUsersByIdentifiers(['1001', '1003']);

      expect(found.map(u => u.nia).sort()).toEqual(['1001', '1003']);
    });

    test('should find staff by document', async () => {
      const found = await db.getUsersByIdentifiers(['X111']);

      expect(found).toHaveLength(1);
      expect(found[0].document).toBe('X111');
    });

    test('should resolve a mix of both in one call', async () => {
      const found = await db.getUsersByIdentifiers(['1002', 'X222']);

      expect(found).toHaveLength(2);
    });

    test('should include the group name', async () => {
      const [found] = await db.getUsersByIdentifiers(['1001']);

      expect(found.group_name).toBe('Primero ESO');
    });

    test('should ignore identifiers that match nobody', async () => {
      const found = await db.getUsersByIdentifiers(['1001', 'nope']);

      expect(found).toHaveLength(1);
    });

    test('should return nothing for an empty list', async () => {
      await expect(db.getUsersByIdentifiers([])).resolves.toEqual([]);
      await expect(db.getUsersByIdentifiers(null)).resolves.toEqual([]);
    });

    test('should handle more identifiers than fit in one statement', async () => {
      // Each identifier is bound twice, so a long list has to be chunked
      const many = Array.from({ length: 1200 }, (_, i) => `bulk${i}`);
      many.push('1001', 'X111');

      const found = await db.getUsersByIdentifiers(many);

      expect(found).toHaveLength(2);
    });
  });

  describe('getProjectStatistics()', () => {
    test('should report zeros on an empty project', async () => {
      const stats = await db.getProjectStatistics();

      expect(stats).toMatchObject({
        totalUsers: 0,
        usersWithImage: 0,
        usersWithoutImage: 0,
        totalGroups: 0,
        taggedImages: 0,
        usersByType: {}
      });
    });

    test('should count users, groups and linked photos', async () => {
      await importUsers([student(3001), student(3002), student(3003)], [staff('X1')]);
      const users = await db.getUsers({});
      await db.linkImageToUser(users[0].id, 'photo0.jpg');
      await db.linkImageToUser(users[1].id, 'photo1.jpg');

      const stats = await db.getProjectStatistics();

      expect(stats.totalUsers).toBe(4);
      expect(stats.usersWithImage).toBe(2);
      expect(stats.usersWithoutImage).toBe(2);
      // The imported group plus the default one the teacher lands in
      expect(stats.totalGroups).toBeGreaterThanOrEqual(1);
    });

    test('should break the users down by type', async () => {
      await importUsers([student(4001), student(4002)], [staff('X2')]);

      const stats = await db.getProjectStatistics();

      expect(stats.usersByType.student).toBe(2);
      expect(stats.usersByType.teacher).toBe(1);
    });

    test('should not count an empty image_path as a linked photo', async () => {
      await importUsers([student(5001), student(5002)]);
      const users = await db.getUsers({});
      db.run('UPDATE users SET image_path = ? WHERE id = ?', ['', users[0].id]);

      const stats = await db.getProjectStatistics();

      expect(stats.usersWithImage).toBe(0);
      expect(stats.usersWithoutImage).toBe(2);
    });

    test('should count each tagged image once', async () => {
      await db.addImageTag('photo0.jpg', 'revisar');
      await db.addImageTag('photo0.jpg', 'repetir');
      await db.addImageTag('photo1.jpg', 'revisar');

      const stats = await db.getProjectStatistics();

      expect(stats.taggedImages).toBe(2);
    });
  });

  describe('getGroupPhotoCoverage()', () => {
    const setGroup = async (userId, groupCode) => {
      db.run('UPDATE users SET group_code = ? WHERE id = ?', [groupCode, userId]);
    };

    test('should count linked and missing photos per group', async () => {
      await importUsers([student(6001), student(6002), student(6003)]);
      const users = await db.getUsers({});
      await db.linkImageToUser(users[0].id, 'photo0.jpg');

      const coverage = await db.getGroupPhotoCoverage();

      expect(coverage).toEqual([
        { code: '1ESO', name: 'Primero ESO', total: 3, withImage: 1, withoutImage: 2 }
      ]);
    });

    test('should leave out groups with nobody in them', async () => {
      await importUsers([]);

      expect(await db.getGroupPhotoCoverage()).toEqual([]);
    });

    test('should leave out the deleted users group', async () => {
      await importUsers([student(6101), student(6102)]);
      const users = await db.getUsers({});
      await setGroup(users[0].id, 'ELIMINADOS');

      const coverage = await db.getGroupPhotoCoverage();

      expect(coverage.map((group) => group.code)).toEqual(['1ESO']);
      expect(coverage[0].total).toBe(1);
    });

    test('should still count a group code missing from the groups table', async () => {
      await importUsers([student(6201)]);
      const users = await db.getUsers({});
      await setGroup(users[0].id, 'HUERFANO');

      const coverage = await db.getGroupPhotoCoverage();

      expect(coverage).toEqual([
        { code: 'HUERFANO', name: 'HUERFANO', total: 1, withImage: 0, withoutImage: 1 }
      ]);
    });

    test('should not count an empty image_path as a linked photo', async () => {
      await importUsers([student(6301)]);
      const users = await db.getUsers({});
      await db.linkImageToUser(users[0].id, '');

      const [group] = await db.getGroupPhotoCoverage();

      expect(group.withImage).toBe(0);
    });

    test('should count with the check it is given instead of the linked photo', async () => {
      await importUsers([student(6401), student(6402)]);
      const users = await db.getUsers({});
      await db.linkImageToUser(users[0].id, 'photo0.jpg');

      const [group] = await db.getGroupPhotoCoverage((user) => user.nia === '6402');

      expect(group).toMatchObject({ total: 2, withImage: 1, withoutImage: 1 });
    });
  });

  describe('clearCapturedImages()', () => {
    const linkAll = async () => {
      const users = await db.getUsers({});
      await Promise.all(
        users.map((user, index) => db.linkImageToUser(user.id, `photo${index}.jpg`))
      );
      return users;
    };

    beforeEach(async () => {
      await importUsers([student(6001), student(6002), student(6003)]);
    });

    test('should clear the whole project when given no users', async () => {
      await linkAll();

      const result = await db.clearCapturedImages();

      expect(result.cleared).toBe(3);
      const remaining = (await db.getUsers({})).filter(u => u.image_path);
      expect(remaining).toHaveLength(0);
    });

    test('should clear only the users it is given', async () => {
      const users = await linkAll();

      const result = await db.clearCapturedImages([users[0].id, users[1].id]);

      expect(result.cleared).toBe(2);
      const remaining = (await db.getUsers({})).filter(u => u.image_path);
      expect(remaining.map(u => u.id)).toEqual([users[2].id]);
    });

    test('should leave everyone linked when given an empty list', async () => {
      await linkAll();

      const result = await db.clearCapturedImages([]);

      expect(result.cleared).toBe(0);
      const remaining = (await db.getUsers({})).filter(u => u.image_path);
      expect(remaining).toHaveLength(3);
    });

    test('should ignore users that are not linked', async () => {
      const users = await db.getUsers({});
      await db.linkImageToUser(users[0].id, 'photo0.jpg');

      const result = await db.clearCapturedImages(users.map(u => u.id));

      expect(result.cleared).toBe(1);
    });
  });

  describe('image relationship backup', () => {
    const linkImages = async () => {
      const users = await db.getUsers({});
      await Promise.all(
        users.map((user, index) => db.linkImageToUser(user.id, `photo${index}.jpg`))
      );
      return users;
    };

    beforeEach(async () => {
      await importUsers([student(2001), student(2002), student(2003)]);
    });

    test('should back up every linked relationship', async () => {
      await linkImages();

      const result = await db.backupUserImageRelationships();

      expect(result.count).toBe(3);
    });

    test('should restore the relationships it backed up', async () => {
      await linkImages();
      const { backupDate } = await db.backupUserImageRelationships();

      await db.clearCapturedImages();
      expect((await db.getUsers({})).every(u => !u.image_path)).toBe(true);

      const result = await db.restoreUserImageRelationships(backupDate);

      expect(result.restored).toBe(3);
      expect((await db.getUsers({})).every(u => u.image_path)).toBe(true);
    });

    test('should leave nothing half written', async () => {
      await linkImages();
      const { backupDate } = await db.backupUserImageRelationships();

      const rows = await query(
        'SELECT COUNT(*) AS total FROM image_relationships_backup WHERE backup_date = ?',
        [backupDate]
      );

      expect(rows[0].total).toBe(3);
    });

    test('should report nothing to back up when no image is linked', async () => {
      const result = await db.backupUserImageRelationships();

      expect(result.count).toBe(0);
    });
  });
});
