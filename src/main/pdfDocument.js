// @ts-check
/**
 * A4 PDF documents for the exports and reports
 *
 * This is the only module that creates pdfkit documents
 * (dependencyBoundaries.test.js checks it). What it owns is the life of a
 * document, which is where pdfkit has caught the application out:
 *
 * - every page is A4 portrait. addPage() with options replaces the document's
 *   instead of merging them, and without a size pdfkit falls back to Letter;
 * - the file's errors are listened to from the start. A folder that is gone
 *   (a disconnected Drive) fails when the file opens, and an error nobody
 *   listens to is an uncaught exception in the main process;
 * - finish() resolves once the file is completely written, and rejects if it
 *   could not be.
 *
 * Drawing is pdfkit's own API on `doc`, checked by `npm run typecheck`.
 * pdfDocument.test.js reads back the PDFs pdfkit writes, so an upgrade of
 * pdfkit is checked there.
 */

const fs = require('fs');

/** @typedef {{top: number, bottom: number, left: number, right: number}} Margins */

/** @type {{size: string, layout: 'portrait'}} */
const PAGE = { size: 'A4', layout: 'portrait' };

/**
 * Start a PDF at this path
 *
 * @param {string} filePath
 * @param {Object} [options]
 * @param {Margins} [options.margins] - of every page unless addPage() says otherwise
 * @param {boolean} [options.bufferPages] - keep the pages to go back to them
 *   (doc.switchToPage()) before finish(), for "Página n de m"
 * @returns {{doc: PDFKit.PDFDocument, addPage: (margins?: Margins) => void, finish: () => Promise<void>}}
 */
function createPdf(filePath, { margins, bufferPages = false } = {}) {
  // Loaded on first use: no PDF is needed at boot
  const PDFDocument = require('pdfkit');

  const pageMargins = margins || { top: 72, bottom: 72, left: 72, right: 72 };
  const doc = new PDFDocument({ ...PAGE, margins: pageMargins, bufferPages });

  const stream = fs.createWriteStream(filePath);
  // Listened to right away, before anything is written
  const written = new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(undefined));
    stream.on('error', reject);
  });
  // A failure before finish() is called would otherwise be reported as an
  // unhandled rejection; finish() still returns it
  written.catch(() => {});
  doc.pipe(stream);

  return {
    doc,

    /**
     * A new A4 page, with the document's margins or these
     * @param {Margins} [newMargins]
     */
    addPage(newMargins) {
      doc.addPage({ ...PAGE, margins: newMargins || pageMargins });
    },

    /** Close the document and wait for the file to be written */
    async finish() {
      doc.end();
      await written;
    }
  };
}

module.exports = { createPdf };
