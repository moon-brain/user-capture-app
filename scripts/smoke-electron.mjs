/**
 * Smoke test of the real application
 *
 *   npm run test:smoke
 *
 * Jest runs the code in the system Node; the application runs in Electron's,
 * with its own V8, its own node:sqlite and the native modules loaded by
 * Chromium's process. This launches the real app on a copy of a project
 * written by 1.24.1 (tests/fixtures/compat) and, through window.electronAPI as
 * the window would, goes through every library at least once:
 *
 *   node:sqlite (open, list, write), sharp (a thumbnail), chokidar (a photo
 *   dropped in the ingest folder), pdfkit (a PDF), yazl (a ZIP),
 *   fast-xml-parser (reading an XML) and markdown-it (a manual page)
 *
 * and then closes the window as a person would and checks that the app ends
 * cleanly and leaves the database closed. Nothing of the user's is touched: it
 * runs with its own --user-data-dir in a temporary folder.
 *
 * It needs a desktop session (the window is shown), so it is not part of
 * `npm test`. It is the check to run after updating Electron or any library.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'compat', 'v1.24.1');
const TIMEOUT = 60000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(what, check, timeout = TIMEOUT) {
  const start = Date.now();
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch { /* not yet */ }
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${what}`);
    await sleep(250);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** A Chrome DevTools Protocol session on the main window */
async function connect(port) {
  const page = await waitFor('the main window', async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    return targets.find((target) => target.type === 'page' && target.url.includes('index.html'));
  });
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let lastId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiting = pending.get(message.id);
    if (waiting) {
      pending.delete(message.id);
      waiting(message);
    }
  });

  return {
    /** Evaluate in the window and return the value, or throw what it threw */
    async evaluate(expression) {
      const id = ++lastId;
      const message = await new Promise((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
      });
      const { result, exceptionDetails } = message.result || {};
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result?.value;
    },
    send(method, params = {}) {
      ws.send(JSON.stringify({ id: ++lastId, method, params }));
    },
    close() {
      ws.close();
    }
  };
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-capture-smoke-'));
  const project = path.join(work, 'Fotos curso 2025-26');
  const userData = path.join(work, 'userData');
  const repository = path.join(work, 'Depósito');
  const exports = path.join(work, 'Exportaciones');

  fs.cpSync(path.join(FIXTURE, 'project'), project, { recursive: true });
  fs.cpSync(path.join(FIXTURE, 'XML'), path.join(work, 'XML'), { recursive: true });
  fs.mkdirSync(userData);
  fs.mkdirSync(repository);
  fs.mkdirSync(exports);
  // The app opens the most recent project on start
  fs.writeFileSync(path.join(userData, 'recent-projects.json'), JSON.stringify([project]));
  // Two students with a photo in the repository, for the ZIP
  for (const [nia, photo] of [['10000001', '20251014093001.jpg'], ['10000002', '20251014093002.jpg']]) {
    fs.copyFileSync(path.join(project, 'imports', photo), path.join(repository, `${nia}.jpg`));
  }

  const port = await freePort();
  const electron = require('electron');
  const app = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  app.stdout.on('data', (chunk) => { output += chunk; });
  app.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => app.on('exit', (code) => resolve(code)));

  const results = [];
  const check = async (name, run) => {
    try {
      const detail = await run();
      results.push({ name, ok: true, detail });
    } catch (error) {
      results.push({ name, ok: false, detail: error.message });
    }
  };

  let cdp;
  try {
    cdp = await connect(port);
    const api = (call) => cdp.evaluate(`window.electronAPI.${call}`);

    await waitFor('the project to open', async () => {
      const info = await api('getProjectInfo()');
      return info && info.projectPath === project;
    });

    await check('node:sqlite: lists the users of a 1.24.1 project', async () => {
      const result = await api('getUsers({}, { loadRepositoryImages: false })');
      const users = Array.isArray(result) ? result : result.users;
      if (users.length !== 8) throw new Error(`${users.length} users, expected 8`);
      const begona = users.find((user) => user.nia === '10000001');
      if (!begona?.image_path?.endsWith('20251014093001.jpg')) throw new Error('Begoña lost her photo');
      return `${users.length} users`;
    });

    await check('node:sqlite: writes and reads back', async () => {
      const result = await api('getUsers({}, { loadRepositoryImages: false })');
      const users = Array.isArray(result) ? result : result.users;
      const joan = users.find((user) => user.nia === '10000005');
      await api(`markOrlaPaid(${joan.id}, true)`);
      const paid = await api(`getOrlaPaidStatus(${joan.id})`);
      if (!(paid === true || paid?.isPaid === true || paid?.paid === true)) throw new Error(`orla paid read back as ${JSON.stringify(paid)}`);
      return 'orla payment saved';
    });

    await check('window: shows the list', async () => {
      await waitFor('the rows', () => cdp.evaluate("document.body.innerText.includes('Begoña')"), 15000);
      return 'Begoña is on screen';
    });

    await check('sharp: makes a thumbnail', async () => {
      const photo = JSON.stringify(path.join(project, 'imports', '20251014093002.jpg'));
      const size = await cdp.evaluate(`new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
        img.onerror = () => reject(new Error('the thumbnail did not load'));
        img.src = window.imageUrl.thumbnail(${photo}, 64);
      })`);
      if (Math.max(...size) > 64 || Math.min(...size) < 1) throw new Error(`thumbnail of ${size.join('x')}`);
      return `${size.join('x')} thumbnail`;
    });

    await check('chokidar: imports a photo dropped in the ingest folder', async () => {
      const before = (await api('getImages()')).images.length;
      fs.copyFileSync(path.join(project, 'imports', '20251014093005.jpg'), path.join(project, 'ingest', 'nueva.jpg'));
      const after = await waitFor('the photo to reach imports', async () => {
        const images = (await api('getImages()')).images.length;
        return images > before ? images : 0;
      }, 20000);
      if (fs.existsSync(path.join(project, 'ingest', 'nueva.jpg'))) throw new Error('still in ingest');
      return `${before} → ${after} photos`;
    });

    await check('pdfkit: writes a PDF', async () => {
      const usersByGroup = { '2BACHA': [{ type: 'student', first_name: 'Ana', last_name1: 'Álvarez', last_name2: 'Gil', group_code: '2BACHA' }] };
      const result = await api(`exportPaidUsersListPDF(${JSON.stringify({ exportPath: exports, usersByGroup })})`);
      if (!result?.success) throw new Error(result?.error || 'no result');
      const pdf = fs.readFileSync(path.join(exports, result.fileName), 'latin1');
      if (!pdf.startsWith('%PDF') || !pdf.trimEnd().endsWith('%%EOF')) throw new Error('not a complete PDF');
      return result.fileName;
    });

    await check('yazl: writes a ZIP', async () => {
      const set = await api(`setImageRepositoryPath(${JSON.stringify(repository)})`);
      if (set && set.success === false) throw new Error(set.error);
      const result = await api(`getUsers({}, { loadRepositoryImages: false })`);
      const users = Array.isArray(result) ? result : result.users;
      const exported = await api(`exportInventoryImages(${JSON.stringify(exports)}, ${JSON.stringify(users)}, { zipEnabled: true, zipMaxSizeMB: 25 })`);
      if (exported && exported.success === false) throw new Error(exported.error);
      const zip = path.join(exports, 'imagenes.zip');
      if (!fs.existsSync(zip)) throw new Error('no imagenes.zip');
      if (fs.readFileSync(zip).subarray(0, 2).toString() !== 'PK') throw new Error('not a ZIP');
      return `imagenes.zip, ${fs.statSync(zip).size} bytes`;
    });

    await check('fast-xml-parser: reads an XML update', async () => {
      const result = await api(`updateXML(${JSON.stringify(path.join(work, 'XML', 'centro_2025.xml'))})`);
      if (!result?.success) throw new Error(result?.error || 'no result');
      return 'analysed (not applied)';
    });

    await check('markdown-it: renders a manual page', async () => {
      const { pages } = await api('helpGetPages()');
      const first = pages[0];
      const result = await api(`helpGetPage(${JSON.stringify(first.id)})`);
      if (!result?.success) throw new Error(result?.error || 'no result');
      if (!result.page.html.includes('<h1')) throw new Error('no HTML');
      return `"${first.title}"`;
    });

    // As a person would: close the window, and the app quits
    cdp.send('Runtime.evaluate', { expression: 'window.close()' });
    cdp.close();
    cdp = null;

    await check('the app quits by itself and leaves the database closed', async () => {
      const code = await Promise.race([exited, sleep(20000).then(() => 'still running')]);
      if (code !== 0) throw new Error(`exit code ${code}`);
      const data = fs.readdirSync(path.join(project, 'data'));
      if (data.join() !== 'users.db') throw new Error(`data/ has ${data.join(', ')}`);
      return 'exit code 0, only users.db';
    });
  } catch (error) {
    results.push({ name: 'run', ok: false, detail: error.message });
  } finally {
    if (cdp) cdp.close();
    if (app.exitCode === null) app.kill();
    await exited;
  }

  for (const { name, ok, detail } of results) {
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} failed. Application output:\n${output.slice(-4000)}`);
    console.log(`Work folder kept: ${work}`);
    process.exit(1);
  }
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(`\nAll ${results.length} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
