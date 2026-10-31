/**
 * Paid users list PDF (export-paid-users-list-pdf, menu Orla)
 *
 * One document with every group: each one's students in order and a
 * subtotal, and a last page with the totals. Every page A4, the names as they
 * are written (accents included), and a failure reported, not thrown.
 *
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockHandlers = new Map();
jest.mock('electron', () => ({
  // No config.json there, so no logo
  app: { getPath: () => require('os').tmpdir() + '/edu-capture-paid-list-config' },
  ipcMain: {
    handle: jest.fn((channel, handler) => mockHandlers.set(channel, handler))
  }
}));

const { registerExportHandlers } = require('../../../src/main/ipc/exportHandlers');
const { readPdf, A4_MEDIA_BOX } = require('../../helpers/readPdf');

const logger = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  section: jest.fn()
};

describe('export-paid-users-list-pdf', () => {
  const fixturesPath = path.join(os.tmpdir(), 'edu-capture-paid-list-tests');
  let testId = 0;
  let exportPath;

  const student = (first, last1, last2, group) => ({
    type: 'student', first_name: first, last_name1: last1, last_name2: last2, group_code: group
  });

  const run = (usersByGroup) =>
    mockHandlers.get('export-paid-users-list-pdf')({}, { exportPath, usersByGroup });

  beforeAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true });
    fs.mkdirSync(fixturesPath, { recursive: true });
    registerExportHandlers({ mainWindow: () => null, logger, state: {}, repositoryMirror: () => null });
  });

  afterAll(() => {
    fs.rmSync(fixturesPath, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.useRealTimers();
    testId++;
    exportPath = path.join(fixturesPath, `export-${testId}`);
    fs.mkdirSync(exportPath, { recursive: true });
  });

  test('should list each group in order, with subtotals and a page of totals', async () => {
    const result = await run({
      '2BACHB': [student('Luis', 'Zapata', '', '2BACHB')],
      '2BACHA': [
        student('Begoña', 'Núñez', 'Pérez', '2BACHA'),
        student('Ana', 'Álvarez', null, '2BACHA')
      ]
    });

    expect(result.success).toBe(true);
    expect(result.fileName).toMatch(/^Alumnos_Pagados_\d{14}\.pdf$/);

    const pdf = readPdf(path.join(exportPath, result.fileName));
    expect(pdf.complete).toBe(true);
    expect(pdf.pages).toEqual([A4_MEDIA_BOX, A4_MEDIA_BOX]);

    const text = pdf.text;
    // Groups by code, people by surname without minding accents
    const order = ['Grupo 2BACHA', '1. Álvarez, Ana', '2. Núñez Pérez, Begoña', 'Subtotal grupo 2BACHA: 2 alumnos',
      'Grupo 2BACHB', '3. Zapata, Luis', 'Subtotal grupo 2BACHB: 1 alumno', 'Resumen', 'Total de grupos: 2', 'Total de alumnos: 3'];
    const positions = order.map((line) => text.indexOf(line));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('should go on to more A4 pages when a list does not fit', async () => {
    const many = Array.from({ length: 120 }, (_, i) => student(`Nombre${i}`, `Apellido${String(i).padStart(3, '0')}`, '', '2BACHA'));

    const result = await run({ '2BACHA': many });

    const pdf = readPdf(path.join(exportPath, result.fileName));
    expect(pdf.pages.length).toBeGreaterThan(3);
    expect(pdf.pages.every((box) => box === A4_MEDIA_BOX)).toBe(true);
    expect(pdf.text).toContain('120. Apellido119, Nombre119');
  });

  test('should report a folder that is gone instead of throwing', async () => {
    exportPath = path.join(fixturesPath, 'no-such-folder');

    const result = await run({ '2BACHA': [student('Ana', 'Ruiz', '', '2BACHA')] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
  });
});
