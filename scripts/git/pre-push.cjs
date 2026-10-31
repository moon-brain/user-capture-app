/**
 * pre-push hook: type check and the whole unit suite before pushing, so a
 * branch reaches GitHub (and its pull request) already green. The smoke test
 * in Electron is left to CI: it opens the window.
 *
 * Pushing only tags or deleting branches checks nothing: a release tag goes
 * on a commit main already has, and that commit passed CI.
 * To skip it once: git push --no-verify
 */
const { spawnSync } = require('child_process');

const ZERO = /^0+$/;
const updates = require('fs').readFileSync(0, 'utf8').split('\n').filter(Boolean).map((line) => {
  const [localRef, localSha] = line.split(' ');
  return { localRef, localSha };
});
const needsChecks = updates.some(({ localRef, localSha }) => !ZERO.test(localSha) && !localRef.startsWith('refs/tags/'));
if (!needsChecks) process.exit(0);

// One command line, run by the shell: npm is npm.cmd on Windows, and Node
// warns (DEP0190) when arguments are passed separately with shell: true
const run = (label, command) => {
  console.log(`\npre-push: ${label}...`);
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\npre-push: ${label} ha fallado. No se ha subido nada.\n`);
    process.exit(1);
  }
};

run('comprobación de tipos', 'npm run typecheck');
// jest.config.cjs has verbose: true; here only the summary and the failures
run('tests', 'npm test -- --ci --silent --verbose=false');
