/**
 * export-inventory-images handler tests
 *
 * The repository photos for Edu Inventory Manager, named by NIA or document,
 * loose or in ZIPs. What must hold with ZIPs: every photo is in a ZIP under
 * its name, they are split as the manual says, and nothing is left behind in
 * the folder the user chose, neither loose photos nor the temporary folder the
 * photos go through, whatever happens.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const mockHandlers = new Map();
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockHandlers.set(channel, handler))
  }
}));

const { registerExportHandlers } = require('../../../src/main/ipc/exportHandlers');
const { readZip } = require('../../helpers/readZip');

const logger = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  section: jest.fn()
};

const TEMP_FOLDER = '.temp-images';

describe('export-inventory-images handler', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-export-inventory-images-tests');
  let testId = 0;
  let repositoryPath;
  let exportPath;
  let state;

  const student = (nia) => ({
    id: Number(nia),
    type: 'student',
    nia: String(nia),
    document: '',
    first_name: `Nombre${nia}`,
    last_name1: `Apellido${nia}`,
    group_code: '1ESOA',
    image_path: null
  });

  const addRepositoryPhoto = async (filename) => {
    // Noise, so each photo has a size of its own and ZIPs can be split by it
    const buffer = await sharp({
      create: { width: 120, height: 160, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 50 } }
    }).jpeg().toBuffer();
    fs.writeFileSync(path.join(repositoryPath, filename), buffer);
    return buffer;
  };

  const runExport = (users, options) =>
    mockHandlers.get('export-inventory-images')({}, exportPath, users, options);

  const listExport = () => fs.readdirSync(exportPath).sort();

  const zipOptions = (zipMaxSizeMB = 25) => ({ copyOriginal: true, resizeEnabled: false, zipEnabled: true, zipMaxSizeMB });

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
    try {
      fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      // Still locked by libvips
    }
  });

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();

    testId++;
    repositoryPath = path.join(fixturesPath, `repository-${testId}`);
    exportPath = path.join(fixturesPath, `export-${testId}`);
    fs.mkdirSync(repositoryPath, { recursive: true });
    fs.mkdirSync(exportPath, { recursive: true });

    state.dbManager = {
      getProjectSetting: jest.fn(async (key) => (key === 'imageRepositoryPath' ? repositoryPath : null))
    };
  });

  test('should copy the photos loose when ZIP is off', async () => {
    await addRepositoryPhoto('1001.jpg');

    const result = await runExport([student(1001)], { copyOriginal: true, resizeEnabled: false, zipEnabled: false });

    expect(result.success).toBe(true);
    expect(listExport()).toEqual(['1001.jpg']);
  });

  test('should put every photo in imagenes.zip under its name, with nothing left loose', async () => {
    const a = await addRepositoryPhoto('1001.jpg');
    const b = await addRepositoryPhoto('1002.jpeg');

    const result = await runExport([student(1001), student(1002)], zipOptions());

    expect(result.success).toBe(true);
    expect(result.results.zipFiles).toEqual([{ name: 'imagenes.zip', count: 2 }]);
    expect(listExport()).toEqual(['imagenes.zip']);

    const entries = readZip(path.join(exportPath, 'imagenes.zip'));
    expect(entries.map((e) => e.name)).toEqual(['1001.jpg', '1002.jpg']);
    expect(entries[0].data.equals(a)).toBe(true);
    expect(entries[1].data.equals(b)).toBe(true);
  });

  test('should split into imagenes_1.zip, imagenes_2.zip... when they do not fit', async () => {
    await addRepositoryPhoto('1001.jpg');
    await addRepositoryPhoto('1002.jpg');
    await addRepositoryPhoto('1003.jpg');

    // Smaller than any one photo: one ZIP each
    const result = await runExport([student(1001), student(1002), student(1003)], zipOptions(0.001));

    expect(result.success).toBe(true);
    expect(listExport()).toEqual(['imagenes_1.zip', 'imagenes_2.zip', 'imagenes_3.zip']);
    const names = listExport().flatMap((zip) => readZip(path.join(exportPath, zip)).map((e) => e.name));
    expect(names).toEqual(['1001.jpg', '1002.jpg', '1003.jpg']);
  });

  test('should leave no temporary folder when no one has a photo', async () => {
    const result = await runExport([student(1001)], zipOptions());

    expect(result.success).toBe(true);
    expect(result.results.exported).toBe(0);
    expect(listExport()).toEqual([]);
  });

  test('should leave no temporary folder when writing the ZIP fails', async () => {
    await addRepositoryPhoto('1001.jpg');
    // A folder where the ZIP should go: it cannot be written
    fs.mkdirSync(path.join(exportPath, 'imagenes.zip'));

    const result = await runExport([student(1001)], zipOptions());

    expect(result.success).toBe(false);
    expect(listExport()).toEqual(['imagenes.zip']);
    expect(fs.existsSync(path.join(exportPath, TEMP_FOLDER))).toBe(false);
  });
});
