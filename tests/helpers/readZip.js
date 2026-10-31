/**
 * A minimal ZIP reader for the tests
 *
 * Reads the central directory and inflates each entry with Node's zlib, so
 * the ZIPs the application writes are checked without trusting archiver,
 * which wrote them.
 */

const fs = require('fs');
const zlib = require('zlib');

/**
 * Entries of a ZIP: name and contents, read from its central directory
 * @param {string} zipPath
 * @returns {Array<{name: string, data: Buffer}>}
 */
function readZip(zipPath) {
  const zip = fs.readFileSync(zipPath);

  // End of central directory: signature 0x06054b50, searched from the end
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a ZIP: no end of central directory');

  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Bad central directory entry');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);

    // The data follows the local header, whose name and extra may differ in length
    const localName = zip.readUInt16LE(localOffset + 26);
    const localExtra = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    const raw = zip.subarray(start, start + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);

    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

module.exports = { readZip };
