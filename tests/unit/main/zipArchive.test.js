/**
 * zipArchive.js: how files are split into ZIPs, and the ZIPs archiver writes
 *
 * planZipArchives() is pure and tested on its own. writeZip() runs against
 * the real ZIP library (yazl) and the ZIPs are read back with a minimal reader
 * of our own (tests/helpers/readZip.js), so what the library writes is
 * checked without trusting it: every file is at the top level under its name
 * and decompresses to the same bytes. Run these first after upgrading or
 * replacing the library.
 *
 * @jest-environment node
 */

jest.useRealTimers();

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { planZipArchives, writeZip } = require('../../../src/main/zipArchive');
const { readZip } = require('../../helpers/readZip');

describe('zipArchive', () => {
  describe('planZipArchives()', () => {
    const entry = (name, size) => ({ path: `/x/${name}`, name, size });

    it('should put everything in one ZIP called imagenes.zip when it fits', () => {
      const plan = planZipArchives([entry('1.jpg', 10), entry('2.jpg', 10)], 100);

      expect(plan.map((zip) => zip.name)).toEqual(['imagenes.zip']);
      expect(plan[0].entries.map((e) => e.name)).toEqual(['1.jpg', '2.jpg']);
      expect(plan[0].bytes).toBe(20);
    });

    it('should number the ZIPs from 1 when they are split', () => {
      // What the manual says: imagenes_1.zip, imagenes_2.zip...
      const plan = planZipArchives([entry('1.jpg', 60), entry('2.jpg', 60), entry('3.jpg', 60)], 100);

      expect(plan.map((zip) => zip.name)).toEqual(['imagenes_1.zip', 'imagenes_2.zip', 'imagenes_3.zip']);
    });

    it('should fill each ZIP up to the limit, keeping the order', () => {
      const plan = planZipArchives(
        [entry('1.jpg', 40), entry('2.jpg', 40), entry('3.jpg', 40), entry('4.jpg', 10)],
        100
      );

      expect(plan.map((zip) => zip.entries.map((e) => e.name))).toEqual([['1.jpg', '2.jpg'], ['3.jpg', '4.jpg']]);
    });

    it('should accept a ZIP exactly at the limit', () => {
      expect(planZipArchives([entry('1.jpg', 50), entry('2.jpg', 50)], 100)).toHaveLength(1);
    });

    it('should still include a file larger than the limit, alone', () => {
      const plan = planZipArchives([entry('1.jpg', 10), entry('big.jpg', 500), entry('3.jpg', 10)], 100);

      expect(plan.map((zip) => zip.entries.map((e) => e.name))).toEqual([['1.jpg'], ['big.jpg'], ['3.jpg']]);
    });

    it('should plan nothing for no files', () => {
      expect(planZipArchives([], 100)).toEqual([]);
    });

    it('should take another base name', () => {
      expect(planZipArchives([entry('1.jpg', 1)], 100, 'fotos')[0].name).toBe('fotos.zip');
    });
  });

  describe('writeZip() (contract with the ZIP library)', () => {
    const dir = path.join(os.tmpdir(), `edu-capture-zip-tests-${process.pid}`);

    beforeEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, 'source', 'nested'), { recursive: true });
    });

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('should store every file at the top level, under the name given, with the same bytes', async () => {
      const a = crypto.randomBytes(5000);
      const b = Buffer.from('x'.repeat(20000)); // compresses: checks the deflate path
      fs.writeFileSync(path.join(dir, 'source', 'a.bin'), a);
      fs.writeFileSync(path.join(dir, 'source', 'nested', 'b.bin'), b);
      const zipPath = path.join(dir, 'out.zip');

      await writeZip(zipPath, [
        { path: path.join(dir, 'source', 'a.bin'), name: '1001.jpg' },
        { path: path.join(dir, 'source', 'nested', 'b.bin'), name: '12345678Z.jpg' }
      ]);

      const entries = readZip(zipPath);
      expect(entries.map((e) => e.name)).toEqual(['1001.jpg', '12345678Z.jpg']);
      expect(entries[0].data.equals(a)).toBe(true);
      expect(entries[1].data.equals(b)).toBe(true);
    });

    it('should have finished writing when it resolves', async () => {
      fs.writeFileSync(path.join(dir, 'source', 'a.bin'), crypto.randomBytes(200000));
      const zipPath = path.join(dir, 'out.zip');

      await writeZip(zipPath, [{ path: path.join(dir, 'source', 'a.bin'), name: 'a.jpg' }]);

      // Readable to the end straight away: the central directory is the last thing written
      expect(readZip(zipPath)).toHaveLength(1);
    });

    it('should write a valid empty ZIP for no files', async () => {
      const zipPath = path.join(dir, 'empty.zip');

      await writeZip(zipPath, []);

      expect(readZip(zipPath)).toEqual([]);
    });

    it('should fail, not hang, when a file to add is missing, and leave no ZIP', async () => {
      fs.writeFileSync(path.join(dir, 'source', 'a.bin'), crypto.randomBytes(5000));
      const zipPath = path.join(dir, 'out.zip');

      await expect(writeZip(zipPath, [
        { path: path.join(dir, 'source', 'a.bin'), name: 'a.jpg' },
        { path: path.join(dir, 'nope.jpg'), name: 'x.jpg' }
      ])).rejects.toThrow(/ENOENT/);

      // A ZIP that is there has every photo
      expect(fs.existsSync(zipPath)).toBe(false);
    });

    it('should fail, not hang, when the ZIP cannot be written', async () => {
      fs.writeFileSync(path.join(dir, 'source', 'a.bin'), 'a');

      await expect(writeZip(path.join(dir, 'no-such-folder', 'out.zip'), [{ path: path.join(dir, 'source', 'a.bin'), name: 'a.jpg' }]))
        .rejects.toThrow();
    });
  });
});
