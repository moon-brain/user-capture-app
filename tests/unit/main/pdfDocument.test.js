/**
 * Contract tests for pdfDocument.js against the real pdfkit
 *
 * The PDFs are read back as text: pdfkit writes the page and image objects
 * uncompressed, so pages, their size and the images can be counted without a
 * PDF library. Run these first after upgrading pdfkit.
 *
 * @jest-environment node
 */

jest.useRealTimers();

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const { createPdf } = require('../../../src/main/pdfDocument');
const { readPdf, A4_MEDIA_BOX } = require('../../helpers/readPdf');

describe('pdfDocument (contract with pdfkit)', () => {
  const dir = path.join(os.tmpdir(), `edu-capture-pdf-tests-${process.pid}`);
  const file = (name) => path.join(dir, name);

  beforeEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('should write a complete one-page A4 PDF', async () => {
    const pdf = createPdf(file('one.pdf'));
    pdf.doc.text('Hola');

    await pdf.finish();

    const result = readPdf(file('one.pdf'));
    expect(result.complete).toBe(true);
    expect(result.pages).toEqual([A4_MEDIA_BOX]);
  });

  it('should write accented Spanish text that can be read back', async () => {
    // The standard fonts use WinAnsi: names like these must survive it
    const pdf = createPdf(file('text.pdf'));
    pdf.doc.font('Helvetica').text('Núñez Pérez, Begoña - Página 1 de 2');

    await pdf.finish();

    expect(readPdf(file('text.pdf')).text).toContain('Núñez Pérez, Begoña - Página 1 de 2');
  });

  it('should keep every added page A4, also with margins of its own', async () => {
    // pdfkit falls back to Letter when addPage() gets options without a size
    const pdf = createPdf(file('pages.pdf'), { margins: { top: 50, bottom: 50, left: 20, right: 20 } });
    pdf.addPage();
    pdf.addPage({ top: 120, bottom: 120, left: 20, right: 20 });

    await pdf.finish();

    expect(readPdf(file('pages.pdf')).pages).toEqual([A4_MEDIA_BOX, A4_MEDIA_BOX, A4_MEDIA_BOX]);
  });

  it('should apply the margins of an added page', async () => {
    const pdf = createPdf(file('margins.pdf'), { margins: { top: 50, bottom: 50, left: 20, right: 20 } });
    pdf.addPage({ top: 120, bottom: 120, left: 30, right: 30 });

    expect(pdf.doc.page.margins).toEqual({ top: 120, bottom: 120, left: 30, right: 30 });
    expect(pdf.doc.y).toBe(120);
    pdf.addPage();
    expect(pdf.doc.page.margins).toEqual({ top: 50, bottom: 50, left: 20, right: 20 });

    await pdf.finish();
  });

  it('should go back to earlier pages when pages are buffered', async () => {
    // How the reports write "Página n de m"
    const pdf = createPdf(file('buffered.pdf'), { bufferPages: true });
    pdf.addPage();
    pdf.addPage();

    const range = pdf.doc.bufferedPageRange();
    expect(range).toEqual({ start: 0, count: 3 });
    pdf.doc.switchToPage(0);
    pdf.doc.text('Página 1 de 3', 50, 800, { lineBreak: false });

    await pdf.finish();
    expect(readPdf(file('buffered.pdf')).pages).toHaveLength(3);
  });

  it('should embed JPEG photos and PNG logos with transparency', async () => {
    const jpeg = await sharp({ create: { width: 90, height: 120, channels: 3, background: '#3a6' } }).jpeg().toBuffer();
    const png = await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const pdf = createPdf(file('images.pdf'));

    pdf.doc.image(jpeg, 50, 50, { width: 72, height: 96 });
    pdf.doc.image(png, 50, 200, { height: 60 });
    await pdf.finish();

    const { raw, images } = readPdf(file('images.pdf'));
    // The PNG goes in as its colour plus a mask for the transparency
    expect(images).toBe(3);
    expect(raw).toContain('/Filter /DCTDecode');
    expect(raw).toContain('/SMask');
  });

  it('should reject, not crash, when the folder is gone', async () => {
    const pdf = createPdf(path.join(dir, 'no-such-folder', 'x.pdf'));
    pdf.doc.text('Hola');

    await expect(pdf.finish()).rejects.toThrow(/ENOENT/);
  });

  it('should not report an unhandled error while drawing goes on after the file failed', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const pdf = createPdf(path.join(dir, 'no-such-folder', 'x.pdf'));
      // The open fails on a later tick, while the caller is still drawing
      await new Promise((resolve) => setTimeout(resolve, 50));
      pdf.addPage();

      await expect(pdf.finish()).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
