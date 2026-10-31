/**
 * A minimal PDF reader for the tests
 *
 * Enough for the PDFs pdfkit writes with its standard fonts: the page and
 * image objects are plain text, and the text is in compressed content streams
 * as hex strings in WinAnsi (latin1), split by kerning.
 */

const fs = require('fs');
const zlib = require('zlib');

// A4 in points, as pdfkit writes it
const A4_MEDIA_BOX = '[0 0 595.28 841.89]';

/**
 * Text drawn on each content stream, in order. Kerning splits a line into
 * pieces; they are joined, and every TJ/Tj ends in a newline.
 * @param {Buffer} pdf
 * @returns {string}
 */
function extractText(pdf) {
  const raw = pdf.toString('latin1');
  const lines = [];

  for (const match of raw.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    let content;
    try {
      content = zlib.inflateSync(pdf.subarray(start, end)).toString('latin1');
    } catch (error) {
      continue; // an image, or not compressed
    }
    for (const op of content.matchAll(/\[(.*?)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
      const pieces = op[1] !== undefined ? [...op[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1]) : [op[2]];
      lines.push(pieces.map((hex) => Buffer.from(hex, 'hex').toString('latin1')).join(''));
    }
  }
  return lines.join('\n');
}

/**
 * @param {string} filePath
 * @returns {{pages: string[], images: number, complete: boolean, text: string, raw: string}}
 *   pages: the MediaBox of each page; text: what is written on them
 */
function readPdf(filePath) {
  const pdf = fs.readFileSync(filePath);
  const raw = pdf.toString('latin1');
  return {
    raw,
    pages: [...raw.matchAll(/\/Type \/Page\b[\s\S]*?\/MediaBox (\[[^\]]*\])/g)].map((m) => m[1]),
    images: (raw.match(/\/Subtype \/Image/g) || []).length,
    complete: raw.trimEnd().endsWith('%%EOF'),
    text: extractText(pdf)
  };
}

module.exports = { readPdf, A4_MEDIA_BOX };
