import './check-runtime.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const runDirectory = new URL('../.run/', import.meta.url);
const stateFile = new URL('state.json', runDirectory);
const stopFile = new URL('stop.json', runDirectory);
const require = createRequire(import.meta.url);
const children = [];
let definitions = [];
let stopping = false;
let settingUp = true;
let stopRequested = false;
let stopTimer;
let stateOwned = false;
const runId = randomUUID();

async function assertPortAvailable(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`Puerto ${port} ocupado. No se inició ni detuvo ningún proceso ajeno.`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function stop(code) {
  if (stopping) return;
  stopping = true;
  clearInterval(stopTimer);
  console.log('Deteniendo KIPU…');
  await Promise.all(children.map(async ({ child, exited }) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    force.unref();
    await exited;
    clearTimeout(force);
  }));
  if (stateOwned) {
    await rm(stopFile, { force: true });
    await rm(stateFile, { force: true });
  }
  console.log('KIPU_STOPPED');
  process.exitCode = code;
}

function launch(definition) {
  const args = definition.service === 'kipu-web'
    ? [`${root}node_modules/next/dist/bin/next`, 'start', '--hostname', '127.0.0.1', '--port', '3000']
    : [`${root}apps/${definition.service}/dist/main.js`];
  const child = spawn(process.execPath, args, {
    cwd: definition.service === 'kipu-web' ? `${root}apps/kipu-web` : root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${definition.service}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${definition.service}] ${chunk}`));
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      resolve();
      if (!stopping) {
        console.error(`${definition.service} terminó inesperadamente (${code ?? signal}).`);
        void stop(1);
      }
    });
    child.once('error', (error) => {
      resolve();
      console.error(`${definition.service}: ${error.message}`);
      void stop(1);
    });
  });
  children.push({ child, exited });
}

async function waitUntilHealthy(definition) {
  const deadline = Date.now() + 30000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${definition.port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      const body = await response.json();
      if (response.ok && body.service === definition.service && body.status === 'ok') return;
    } catch { /* El proceso puede seguir iniciando. */ }
    await delay(150);
  }
  throw new Error(`No inició ${definition.service} en el tiempo previsto.`);
}

function requestStop() {
  stopRequested = true;
  // Durante la preparación no se han lanzado hijos: terminar ese tramo evita
  // una carrera entre crear el archivo de estado y limpiarlo al recibir Ctrl+C.
  if (!settingUp) void stop(0);
}
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);

try {
  try {
    definitions = require('../packages/contracts/dist/index.js').SERVICE_DEFINITIONS;
    await access(`${root}apps/kipu-web/.next/BUILD_ID`);
    for (const definition of definitions.filter((entry) => entry.service !== 'kipu-web')) {
      await access(`${root}apps/${definition.service}/dist/main.js`);
    }
  } catch {
    throw new Error('Falta la compilación. Ejecuta npm run build antes de npm start.');
  }
  await mkdir(runDirectory, { recursive: true });
  let previous;
  try { previous = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous) {
    let alive = true;
    try { process.kill(previous.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
    if (alive) throw new Error('KIPU ya está iniciado. Usa npm run stop.');
    await rm(stateFile, { force: true });
  }
  for (const definition of definitions) await assertPortAvailable(definition.port);
  await rm(stopFile, { force: true });
  await writeFile(stateFile, JSON.stringify({ pid: process.pid, runId }), { flag: 'wx' });
  stateOwned = true;
  settingUp = false;
  if (stopRequested) {
    await stop(0);
  } else {
    stopTimer = setInterval(async () => {
      try {
        const request = JSON.parse(await readFile(stopFile, 'utf8'));
        if (request.runId === runId) await stop(0);
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
          console.error(error.message);
          await stop(1);
        }
      }
    }, 250);
    for (const definition of definitions) launch(definition);
    await Promise.all(definitions.map(waitUntilHealthy));
    if (!stopping) console.log('KIPU_READY http://localhost:3000 — Ctrl+C o npm run stop');
  }
} catch (error) {
  if (!stopRequested && !stopping) console.error(error.message);
  await stop(stopRequested ? 0 : 1);
}
