// @ts-check
/**
 * ZIP files for the exports
 *
 * This is the only module that uses yazl (dependencyBoundaries.test.js checks
 * it). zipArchive.test.js writes real ZIPs and reads them back with a reader
 * of its own, so an upgrade or a change of library is checked there.
 *
 * It used archiver until 1.24. archiver 8 is published only as an ECMAScript
 * module, which Jest 29 cannot load, so its contract tests could not have
 * run; yazl is CommonJS with a single dependency, and the application only
 * ever added whole files under a name, which is all yazl needs to do.
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
 * the files cannot be read, rather than leaving it out, and then removes the
 * half-written ZIP: a ZIP that is there has every photo.
 *
 * @param {string} zipPath
 * @param {Array<{path: string, name: string}>} entries
 * @returns {Promise<void>}
 */
function writeZip(zipPath, entries) {
  // Loaded on first use: nothing needs it until something is exported
  const yazl = require('yazl');

  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const output = fs.createWriteStream(zipPath);
    let failed = false;

    const fail = (error) => {
      if (failed) return;
      failed = true;
      zip.outputStream.unpipe(output);
      output.destroy();
      // Once the handle is closed, so Windows lets it go
      output.once('close', () => {
        fs.rm(zipPath, { force: true }, () => reject(error));
      });
    };

    output.on('close', () => {
      if (!failed) resolve();
    });
    output.on('error', fail);
    // A file that cannot be read (ENOENT) is an error in yazl, not a warning
    zip.on('error', fail);

    zip.outputStream.pipe(output);
    for (const entry of entries) {
      zip.addFile(entry.path, entry.name, { compressionLevel: 9 });
    }
    zip.end();
  });
}

module.exports = { planZipArchives, writeZip };
