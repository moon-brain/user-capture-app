// @ts-check
/**
 * ZIP files for the exports
 *
 * This is the only module that uses archiver (dependencyBoundaries.test.js
 * checks it). zipArchive.test.js writes real ZIPs and reads them back, so an
 * upgrade of archiver is checked there.
 *
 * Splitting into several ZIPs is decided by planZipArchives(), which only
 * works with names and sizes and does not touch the disk.
 */

const fs = require('fs');

/**
 * @typedef {{path: string, name: string, size: number}} ZipEntry
 *   path: the file to add; name: its name inside the ZIP; size: its bytes on disk
 */

/**
 * How to split files into ZIPs that stay under a size, and what to call them
 *
 * Files are taken in order and a ZIP is closed when the next file would take
 * it over the limit. A file larger than the limit on its own still goes, alone
 * in its ZIP: leaving it out would lose a photo without saying so.
 *
 * One ZIP is called `<base>.zip`; several are `<base>_1.zip`, `<base>_2.zip`...
 * The limit is on the files added, not on the ZIP, which with JPEGs comes out
 * about the same size.
 *
 * @param {Array<ZipEntry>} entries
 * @param {number} maxBytes
 * @param {string} [baseName]
 * @returns {Array<{name: string, entries: Array<ZipEntry>, bytes: number}>}
 */
function planZipArchives(entries, maxBytes, baseName = 'imagenes') {
  /** @type {Array<{entries: Array<ZipEntry>, bytes: number}>} */
  const chunks = [];
  let current = { entries: [], bytes: 0 };

  for (const entry of entries) {
    if (current.entries.length > 0 && current.bytes + entry.size > maxBytes) {
      chunks.push(current);
      current = { entries: [], bytes: 0 };
    }
    current.entries.push(entry);
    current.bytes += entry.size;
  }
  if (current.entries.length > 0) {
    chunks.push(current);
  }

  return chunks.map((chunk, index) => ({
    name: chunks.length === 1 ? `${baseName}.zip` : `${baseName}_${index + 1}.zip`,
    ...chunk
  }));
}

/**
 * Write a ZIP with these files at its top level, under the names given
 *
 * Resolves once the file is completely written and closed. Rejects if any of
 * the files cannot be read, rather than leaving it out.
 *
 * @param {string} zipPath
 * @param {Array<{path: string, name: string}>} entries
 * @returns {Promise<void>}
 */
function writeZip(zipPath, entries) {
  // Loaded on first use: it brings a stream toolchain that nothing needs
  // until something is actually exported
  const archiver = require('archiver');

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
    // archiver only warns about a file it cannot read (ENOENT) and finishes the
    // ZIP without it: a photo would go missing without anyone knowing
    archive.on('warning', (warning) => {
      archive.abort();
      reject(warning);
    });

    archive.pipe(output);
    for (const entry of entries) {
      archive.file(entry.path, { name: entry.name });
    }
    archive.finalize();
  });
}

module.exports = { planZipArchives, writeZip };
