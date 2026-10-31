// @ts-check
/**
 * The school XML shared through the repository (docs/XML_COMPARTIDO_PLAN.md)
 *
 * Each team keeps its own project, so a team that updates its XML is the only
 * one that sees the change. Publishing the XML applied to a project in the
 * repository's Centro folder lets the others find it. What is shared is the
 * source, the XML, never the project's database: SQLite needs file locks that
 * sync clients do not honour.
 *
 * Nothing in Centro is ever deleted or rewritten. Every publication is a new
 * file, centro_<AAAAMMDDHHMMSS>_<team>.xml, and the content's SHA-256 is its
 * identity: an XML already there is not published again, so a team applying
 * the XML another one published does not publish it back.
 *
 * Installed versions up to 1.24 list only .jpg/.jpeg files at the top level of
 * the repository, so they never see this folder.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SHARED_XML_FOLDER = 'Centro';

// project_settings key with what the project last applied
const SETTING_KEY = 'sharedXml';

const NAME_PATTERN = /^centro_(\d{14})_([A-Za-z0-9_-]+)\.xml$/;

/**
 * @typedef {Object} AppliedXml
 * @property {string} hash - SHA-256 of the XML's bytes, hex
 * @property {string|null} fileName - its file in Centro, null until published
 * @property {string} appliedAt - ISO date it was applied to the project
 */

/**
 * @param {Buffer|string} content
 * @returns {string}
 */
function hashXml(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Name of this machine as it goes in a file name, like the Reemplazadas runs
 * @returns {string}
 */
function teamName() {
  return os.hostname().replace(/[^A-Za-z0-9_-]/g, '') || 'host';
}

/**
 * @param {Date} date
 * @returns {string} AAAAMMDDHHMMSS in local time
 */
function formatStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * @param {Date} now
 * @param {string} team
 * @returns {string}
 */
function publishedFileName(now, team) {
  return `centro_${formatStamp(now)}_${team}.xml`;
}

/**
 * When and by whom a file in Centro was published, read from its name
 * @param {string} fileName
 * @returns {{ publishedAt: Date, team: string } | null} null if it is not one
 */
function parsePublishedName(fileName) {
  const match = NAME_PATTERN.exec(fileName);
  if (!match) return null;

  const s = match[1];
  const publishedAt = new Date(
    Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)),
    Number(s.slice(8, 10)), Number(s.slice(10, 12)), Number(s.slice(12, 14))
  );
  if (Number.isNaN(publishedAt.getTime())) return null;

  return { publishedAt, team: match[2] };
}

/**
 * The publication in Centro with exactly this content, if there is one
 *
 * Only files of the same size are read: over a synced drive reading is what
 * costs, and the size is a stat.
 *
 * @param {string} folderPath
 * @param {Buffer} content
 * @param {string} hash
 * @returns {Promise<string|null>}
 */
async function findPublished(folderPath, content, hash) {
  let names;
  try {
    names = await fs.promises.readdir(folderPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  for (const name of names.filter((n) => parsePublishedName(n)).sort()) {
    const filePath = path.join(folderPath, name);
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile() || stats.size !== content.length) continue;
      if (hashXml(await fs.promises.readFile(filePath)) === hash) return name;
    } catch {
      // Gone or unreadable meanwhile: it cannot be the same one
    }
  }

  return null;
}

/**
 * Publish an XML in the repository's Centro folder, unless it is already there
 *
 * Written under a temporary name that does not end in .xml and then renamed,
 * so no other team reads it half copied.
 *
 * @param {string} repositoryPath
 * @param {Buffer} content - the XML's bytes, exactly as applied
 * @param {{ now?: Date, team?: string }} [options]
 * @returns {Promise<{ fileName: string, published: boolean }>} published is
 *   false when the same XML was already there
 */
async function publishXml(repositoryPath, content, options = {}) {
  const folderPath = path.join(repositoryPath, SHARED_XML_FOLDER);
  const hash = hashXml(content);

  const existing = await findPublished(folderPath, content, hash);
  if (existing) {
    return { fileName: existing, published: false };
  }

  await fs.promises.mkdir(folderPath, { recursive: true });

  const team = options.team || teamName();
  const now = options.now || new Date();

  // Two publications in the same second from one team would share the name
  let fileName = publishedFileName(now, team);
  for (let attempt = 1; fs.existsSync(path.join(folderPath, fileName)); attempt++) {
    fileName = publishedFileName(new Date(now.getTime() + attempt * 1000), team);
  }

  const finalPath = path.join(folderPath, fileName);
  const tempPath = `${finalPath}.${team}-${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(tempPath, content);
    await fs.promises.rename(tempPath, finalPath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return { fileName, published: true };
}

/**
 * @param {{ getProjectSetting: (key: string) => Promise<string|null> }} dbManager
 * @returns {Promise<AppliedXml|null>} null for projects from before 1.25, or
 *   when the value cannot be read
 */
async function getAppliedXml(dbManager) {
  const raw = await dbManager.getProjectSetting(SETTING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value.hash === 'string') {
      return {
        hash: value.hash,
        fileName: typeof value.fileName === 'string' ? value.fileName : null,
        appliedAt: typeof value.appliedAt === 'string' ? value.appliedAt : ''
      };
    }
  } catch {
    // Unreadable: as if nothing had been recorded
  }
  return null;
}

/**
 * @param {{ setProjectSetting: (key: string, value: string) => Promise<void> }} dbManager
 * @param {AppliedXml} value
 * @returns {Promise<void>}
 */
async function setAppliedXml(dbManager, value) {
  await dbManager.setProjectSetting(SETTING_KEY, JSON.stringify(value));
}

/**
 * Publish the XML the project last applied, if it can be and is not yet
 *
 * Called after applying an XML (create, update) and after configuring the
 * repository: a new project has no repository yet, so its XML is published
 * once it gets one. Publishing never stops anything else; the result says
 * why it did not happen.
 *
 * The file is read again and only published if it still is, byte for byte,
 * what was applied: it may have been edited or replaced since.
 *
 * @param {Object} params
 * @param {Object} params.dbManager
 * @param {string|null} params.repositoryPath
 * @param {string|null} params.xmlPath - the file the project last applied
 * @param {{ now?: Date, team?: string }} [params.options]
 * @returns {Promise<{ status: 'published'|'already'|'no-repository'|'repository-unavailable'|'not-applied'|'changed'|'failed', fileName?: string, error?: string }>}
 */
async function publishAppliedXml({ dbManager, repositoryPath, xmlPath, options }) {
  const applied = await getAppliedXml(dbManager);
  if (!applied || !xmlPath) {
    return { status: 'not-applied' };
  }
  if (!repositoryPath) {
    return { status: 'no-repository' };
  }
  if (!fs.existsSync(repositoryPath)) {
    return { status: 'repository-unavailable' };
  }

  let content;
  try {
    content = await fs.promises.readFile(xmlPath);
  } catch {
    return { status: 'changed' };
  }
  if (hashXml(content) !== applied.hash) {
    return { status: 'changed' };
  }

  try {
    const { fileName, published } = await publishXml(repositoryPath, content, options);
    if (applied.fileName !== fileName) {
      await setAppliedXml(dbManager, { ...applied, fileName });
    }
    return { status: published ? 'published' : 'already', fileName };
  } catch (error) {
    return { status: 'failed', error: error.message };
  }
}

// Enough to hold the <centro> start tag, which comes first
const HEAD_BYTES = 64 * 1024;
const COURSE_PATTERN = /<centro\b[^>]*?\scurso\s*=\s*["'](\d{4})["']/;

/**
 * Course of a published XML, from <centro curso="2026">, reading only the
 * start of the file
 * @param {string} filePath
 * @returns {Promise<number|null>}
 */
async function readCourse(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    const match = COURSE_PATTERN.exec(buffer.subarray(0, bytesRead).toString('utf8'));
    return match ? Number(match[1]) : null;
  } finally {
    await handle.close();
  }
}

/**
 * @typedef {Object} NewerXml
 * @property {string} fileName
 * @property {string} filePath
 * @property {string} publishedAt - ISO
 * @property {string} team
 * @property {number} academicYear
 */

/**
 * The XML in Centro this project could update to, if there is one
 *
 * The most recent publication of the project's course that is newer than what
 * the project applied and has different content. Publications of other
 * courses are never offered: opening a project of a previous course on
 * purpose is normal, and so is a file without a course, which is skipped.
 *
 * Newest first, and only as far as needed: once a publication is not newer
 * than what was applied, the older ones cannot be either.
 *
 * @param {Object} params
 * @param {string} params.repositoryPath
 * @param {number} params.academicYear - the project's course
 * @param {AppliedXml|null} params.applied - null for projects from before 1.25
 * @param {string|null} [params.currentHash] - for those, hash of the XML file
 *   they recorded, if it can still be read
 * @returns {Promise<NewerXml|null>}
 */
async function findNewerXml({ repositoryPath, academicYear, applied, currentHash = null }) {
  const folderPath = path.join(repositoryPath, SHARED_XML_FOLDER);
  let names;
  try {
    names = await fs.promises.readdir(folderPath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }

  // What the project has: its publication's date when it was published,
  // otherwise when it was applied
  let since = null;
  if (applied) {
    const own = applied.fileName ? parsePublishedName(applied.fileName) : null;
    since = own ? own.publishedAt : (applied.appliedAt ? new Date(applied.appliedAt) : null);
  }
  const haveHash = applied ? applied.hash : currentHash;

  const candidates = names
    .map((name) => ({ name, parsed: parsePublishedName(name) }))
    .filter((c) => c.parsed)
    .sort((a, b) => b.parsed.publishedAt.getTime() - a.parsed.publishedAt.getTime() ||
      (a.name < b.name ? 1 : -1));

  for (const { name, parsed } of candidates) {
    if (since && !(parsed.publishedAt.getTime() > since.getTime())) break;
    if (applied && name === applied.fileName) break;

    const filePath = path.join(folderPath, name);
    try {
      if ((await readCourse(filePath)) !== academicYear) continue;
      if (haveHash && hashXml(await fs.promises.readFile(filePath)) === haveHash) break;
    } catch {
      // Gone or unreadable meanwhile: look at the next one
      continue;
    }

    return {
      fileName: name,
      filePath,
      publishedAt: parsed.publishedAt.toISOString(),
      team: parsed.team,
      academicYear
    };
  }

  return null;
}

/**
 * Publish the open project's XML to a repository it has just been given
 *
 * Proyecto > Configurar depósito de imágenes (main.js) and the
 * set-image-repository-path handler both end here. A new project gets its
 * repository after it is created, so this is when its XML is first shared.
 *
 * @param {Object} dbManager
 * @param {string|null} repositoryPath
 * @returns {Promise<{ status: string, fileName?: string, error?: string }>}
 */
async function publishProjectXml(dbManager, repositoryPath) {
  try {
    return await publishAppliedXml({
      dbManager,
      repositoryPath,
      xmlPath: await dbManager.getProjectSetting('xmlFilePath')
    });
  } catch (error) {
    return { status: 'failed', error: error.message };
  }
}

module.exports = {
  publishProjectXml,
  readCourse,
  findNewerXml,
  SHARED_XML_FOLDER,
  hashXml,
  teamName,
  publishedFileName,
  parsePublishedName,
  findPublished,
  publishXml,
  getAppliedXml,
  setAppliedXml,
  publishAppliedXml
};
