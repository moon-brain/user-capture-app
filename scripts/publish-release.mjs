#!/usr/bin/env node
// Publishes the version that main already has (npm run release:publish)
//
// main only changes through pull requests merged with "rebase and merge",
// which rewrites the commits: a tag made on the release branch would point at
// a commit main does not have. So `npm run release` only makes the
// "chore(release): X.Y.Z" commit, that commit reaches main through its pull
// request, and this script tags it there, on the commit every installation
// will be built from:
//
//   1. checks it is on main, clean, level with origin/main, and that the last
//      commit is "chore(release): <version of package.json>";
//   2. tags it vX.Y.Z (annotated, as commit-and-tag-version did) and pushes
//      only the tag;
//   3. creates the GitHub Release with the notes (release-notes.mjs);
//   4. builds the installer and uploads it with latest.yml (electron-builder).
//
// It stops before touching anything if a check fails. Steps 2 to 4 are
// docs/ACTUALIZACIONES_Y_RELEASE_PLAN.md, section 1.4.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const git = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() };
};
const stop = (message) => {
  console.error(`\n[publish] ${message}\nNo se ha publicado nada.\n`);
  process.exit(1);
};
const step = (label, command, args) => {
  console.log(`\n[publish] ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) stop(`Ha fallado: ${label}. Revisa la sección 1.7 de docs/ACTUALIZACIONES_Y_RELEASE_PLAN.md.`);
};

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const tag = `v${version}`;

// --- 1. Checks, before anything leaves the machine -------------------------

if (!process.env.GH_TOKEN) stop('Falta GH_TOKEN. En PowerShell: $env:GH_TOKEN = gh auth token');

const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
if (branch !== 'main') stop(`Estás en «${branch}». Se publica desde main, después de fusionar el pull request de la versión.`);

if (git('status', '--porcelain', '--untracked-files=no').out) stop('Hay cambios sin commit en archivos del repositorio.');

if (!git('fetch', '--quiet', 'origin', 'main', '--tags').ok) stop('No se ha podido consultar origin.');
const local = git('rev-parse', 'HEAD').out;
const remote = git('rev-parse', 'origin/main').out;
if (local !== remote) stop('main no está igual que origin/main. Haz git pull (o revisa qué falta por fusionar).');

const subject = git('log', '-1', '--format=%s').out;
if (subject !== `chore(release): ${version}`) {
  stop(`El último commit de main es «${subject}», no «chore(release): ${version}».\n` +
    'Primero npm run release en una rama, su pull request y fusionarlo.');
}

const existing = git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`);
if (existing.ok && existing.out !== local) stop(`El tag ${tag} ya existe y apunta a otro commit.`);

// --- 2. The tag, on the commit main has --------------------------------------

if (!existing.ok) {
  const made = git('tag', '-a', tag, '-m', `chore(release): ${version}`);
  if (!made.ok) stop(`No se ha podido crear el tag ${tag}: ${made.err}`);
}
step(`Subiendo el tag ${tag}`, 'git', ['push', 'origin', `refs/tags/${tag}`]);

// --- 3 and 4. The Release, then the installer --------------------------------

step('Creando la Release con las notas del CHANGELOG', 'node', ['scripts/release-notes.mjs']);
step('Empaquetando y subiendo el instalador', 'npx', ['electron-builder', '--win', 'nsis', '--x64', '--publish', 'always']);

console.log(`\n[publish] ${tag} publicada. Compruébala con: gh release view ${tag}\n`);
