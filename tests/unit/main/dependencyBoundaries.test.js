/**
 * Dependency boundary tests
 *
 * Every third-party library the application ships is used from a known,
 * short list of modules. Those modules are the seams that have to be read and
 * tested again when the library is upgraded, so the list is kept here and
 * checked against the code instead of relying on anyone remembering it:
 *
 * - a require() of a library from a module that is not on its list fails;
 * - a module on the list that no longer requires it fails too, so the table
 *   cannot drift into describing code that has moved;
 * - a runtime dependency added to package.json without an entry here fails,
 *   which forces deciding where it enters before it spreads.
 *
 * Paths are relative to the repository root, with forward slashes.
 *
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

// Where each runtime dependency may be required from. When a library gets a
// single facade module, shrink its list to that module.
const ALLOWED = {
  sqlite3: ['src/main/database.js'],
  chokidar: ['src/main/folderWatcher.js'],
  'fast-xml-parser': ['src/main/xmlParser.js'],
  'markdown-it': ['src/main/helpContent.js'],
  // main.js hands autoUpdater to UpdateManager, which never requires it
  'electron-updater': ['main.js'],
  // The image facade: every image operation, checked by imageProcessing.test.js
  sharp: ['src/main/imageProcessing.js'],
  pdfkit: [
    'src/main/photoReports.js',
    'src/main/ipc/exportHandlers.js'
  ],
  archiver: ['src/main/ipc/exportHandlers.js']
};

// Electron is everywhere in the main process by nature, so it has a rule by
// area rather than a list: the renderer runs without Node and must reach it
// only through the preload.
const ELECTRON_ALLOWED_AREAS = ['main.js', 'src/main/', 'src/preload/'];

// Seams that require no library themselves but sit on one: UpdateManager is
// handed electron-updater's autoUpdater, and context.js holds the type of the
// object main.js gives every IPC handler module
const EXTRA_SEAMS = ['src/main/updateManager.js', 'src/main/ipc/context.js'];

const TS_CHECK = /^\/\/ @ts-check\b/;

const SOURCE_DIRS = ['src'];
const SOURCE_FILES = ['main.js'];

function listJsFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      result.push(...listJsFiles(relative));
    } else if (entry.name.endsWith('.js')) {
      result.push(relative);
    }
  }
  return result;
}

/**
 * Package names a file requires, without subpaths ('a/b' -> 'a',
 * '@s/a/b' -> '@s/a'). Comments are dropped first so that a require() quoted
 * in an explanation does not count. Relative requires and Node built-ins are
 * left out by the caller, which only asks about known packages.
 */
function requiredPackages(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const names = new Set();
  const pattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const spec = match[1];
    if (spec.startsWith('.') || spec.startsWith('/')) {
      continue;
    }
    const parts = spec.split('/');
    names.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
  }
  return names;
}

const files = [
  ...SOURCE_DIRS.flatMap(listJsFiles),
  ...SOURCE_FILES
];

const requiresByFile = new Map(
  files.map((file) => [file, requiredPackages(fs.readFileSync(path.join(ROOT, file), 'utf8'))])
);

describe('dependency boundaries', () => {
  describe('requiredPackages()', () => {
    it('should find package names and drop subpaths', () => {
      const names = requiredPackages(
        "const a = require('sharp');\nconst b = require(\"pdfkit/js/data\");\nconst c = require('@scope/pkg/sub');"
      );

      expect([...names].sort()).toEqual(['@scope/pkg', 'pdfkit', 'sharp']);
    });

    it('should ignore relative requires', () => {
      expect([...requiredPackages("require('./database'); require('../x/y')")]).toEqual([]);
    });

    it('should ignore requires quoted in comments', () => {
      const names = requiredPackages(
        "/* we used to require('sqlite3') here */\n  // require('chokidar')\nconst x = 1;"
      );

      expect([...names]).toEqual([]);
    });

    it('should see a require loaded on first use inside a function', () => {
      const names = requiredPackages("function load() {\n  return require('sharp');\n}");

      expect([...names]).toEqual(['sharp']);
    });
  });

  it('should have a rule for every runtime dependency in package.json', () => {
    const { dependencies } = require(path.join(ROOT, 'package.json'));

    const missing = Object.keys(dependencies).filter((name) => !(name in ALLOWED));

    // A new dependency needs an entry in ALLOWED: decide which module it
    // enters through before it is used anywhere else
    expect(missing).toEqual([]);
  });

  describe.each(Object.entries(ALLOWED))('%s', (dependency, allowedFiles) => {
    it('should only be required from its seam modules', () => {
      const offenders = files.filter(
        (file) => requiresByFile.get(file).has(dependency) && !allowedFiles.includes(file)
      );

      expect(offenders).toEqual([]);
    });

    it('should still be required by every module listed for it', () => {
      const stale = allowedFiles.filter(
        (file) => !requiresByFile.has(file) || !requiresByFile.get(file).has(dependency)
      );

      // The table describes the code: remove a module once it stops using the library
      expect(stale).toEqual([]);
    });
  });

  it('should type-check every seam module', () => {
    const seams = new Set([
      ...Object.values(ALLOWED).flat(),
      ...files.filter((file) => requiresByFile.get(file).has('electron')),
      ...EXTRA_SEAMS
    ]);

    const unchecked = [...seams].filter(
      (file) => !TS_CHECK.test(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    );

    // Each must start with `// @ts-check`, so that `npm run typecheck` reports
    // the calls a library upgrade breaks (see tsconfig.json)
    expect(unchecked).toEqual([]);
  });

  it('should keep electron out of the renderer', () => {
    const offenders = files.filter(
      (file) =>
        requiresByFile.get(file).has('electron') &&
        !ELECTRON_ALLOWED_AREAS.some((area) => file === area || file.startsWith(area))
    );

    expect(offenders).toEqual([]);
  });
});
