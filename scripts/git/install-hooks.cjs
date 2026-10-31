/**
 * Points git at the hooks in .githooks (npm "prepare", which runs on
 * npm install and npm ci). Does nothing outside a git checkout or in CI, and
 * never fails the install.
 */
const { spawnSync } = require('child_process');

if (process.env.CI) process.exit(0);
const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (inside.status !== 0 || inside.stdout.trim() !== 'true') process.exit(0);

const set = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { encoding: 'utf8' });
if (set.status !== 0) {
  console.warn('No se pudieron activar los hooks de git (.githooks):', set.stderr.trim());
}
