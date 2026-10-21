import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let definitions;
try { definitions = require('../packages/contracts/dist/index.js').SERVICE_DEFINITIONS; }
catch { throw new Error('Ejecuta npm run build antes de npm test.'); }

function execute(script) {
  const child = spawn(process.execPath, [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
  return { child, exited, output: () => output };
}

async function freePort(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

test('arranque, salud HTTP, UI y parada de todos los procesos', { timeout: 60000 }, async (t) => {
  // No detener una ejecución iniciada por el usuario.
  try {
    const state = JSON.parse(await readFile(new URL('../.run/state.json', import.meta.url), 'utf8'));
    let alive = true;
    try { process.kill(state.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
    assert.equal(alive, false, 'Detén KIPU con npm run stop antes de ejecutar las pruebas.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const execution = execute('scripts/start.mjs');
  try {
    const deadline = Date.now() + 35000;
    while (!execution.output().includes('KIPU_READY') && Date.now() < deadline) {
      assert.equal(execution.child.exitCode, null, execution.output());
      await delay(100);
    }
    assert.match(execution.output(), /KIPU_READY/, execution.output());

    await t.test('los nueve endpoints /health responden con su identidad real', async () => {
      for (const definition of definitions) {
        const response = await fetch(`http://127.0.0.1:${definition.port}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { service: definition.service, status: 'ok' });
      }
    });

    await t.test('el gateway consulta por HTTP el estado de los nueve procesos', async () => {
      const response = await fetch('http://127.0.0.1:4000/health/services');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), definitions.map((entry) => ({ ...entry, status: 'ok' })));
    });

    await t.test('la UI se sirve y el gateway protege el flujo de identidad', async () => {
      const response = await fetch('http://127.0.0.1:3000');
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /KIPU \| Base ejecutable/);
      assert.match(html, /identity-service/);
      assert.match(html, /notification-worker/);
      const registration = await fetch('http://127.0.0.1:4000/v1/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: `test-${Date.now()}@example.test`, handle: `test${Date.now() % 100000}`, terms_accepted: true }),
      });
      assert.equal(registration.status, 201);
      const registered = await registration.json();
      const otpDeadline = Date.now() + 3000;
      let credentials;
      while (!credentials && Date.now() < otpDeadline) {
        const match = execution.output().match(/\"event\":\"DEV_OTP\",\"user_id\":\"([^\"]+)\",\"otp\":\"(\d{6})\"/);
        if (match && match[1] === registered.user_id) credentials = { user_id: match[1], otp: match[2] };
        else await delay(25);
      }
      assert.ok(credentials, execution.output());
      const tokenResponse = await fetch('http://127.0.0.1:4000/v1/auth/token', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials),
      });
      assert.equal(tokenResponse.status, 201);
      const tokens = await tokenResponse.json();
      assert.equal((await fetch('http://127.0.0.1:4000/v1/users/me')).status, 401);
      const profile = await fetch('http://127.0.0.1:4000/v1/users/me', { headers: { authorization: `Bearer ${tokens.access_token}` } });
      assert.equal(profile.status, 200);
      assert.equal((await profile.json()).id, registered.user_id);
    });

    await t.test('un segundo arranque se rechaza sin detener el primero', async () => {
      const duplicate = await execute('scripts/start.mjs').exited;
      assert.equal(duplicate.code, 1);
      assert.match(duplicate.output, /ya está iniciado/);
      assert.equal((await fetch('http://127.0.0.1:4000/health')).status, 200);
    });
  } finally {
    let owned = false;
    try {
      const state = JSON.parse(await readFile(new URL('../.run/state.json', import.meta.url), 'utf8'));
      owned = state.pid === execution.child.pid;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (owned) {
      const stopped = await execute('scripts/stop.mjs').exited;
      assert.equal(stopped.code, 0, stopped.output);
    }
    const result = await execution.exited;
    assert.equal(result.code, 0, result.output);
  }

  await t.test('la parada libera los nueve puertos y puede repetirse', async () => {
    for (const definition of definitions) await freePort(definition.port);
    const stopped = await execute('scripts/stop.mjs').exited;
    assert.equal(stopped.code, 0);
    assert.match(stopped.output, /no está iniciado/);
  });
});

test('un puerto ocupado impide el arranque sin cerrar procesos ajenos', { timeout: 15000 }, async () => {
  const occupied = createServer();
  await new Promise((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(4003, '127.0.0.1', resolve);
  });
  try {
    const result = await execute('scripts/start.mjs').exited;
    assert.equal(result.code, 1);
    assert.match(result.output, /Puerto 4003 ocupado/);
    assert.equal(occupied.listening, true);
    for (const definition of definitions.filter((entry) => entry.port !== 4003)) await freePort(definition.port);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});

test('Ctrl+C durante el arranque limpia los procesos y su estado', {
  timeout: 15000,
  skip: process.platform === 'win32' ? 'La señal sintética POSIX no equivale al Ctrl+C de una consola Windows.' : false,
}, async () => {
  const execution = execute('scripts/start.mjs');
  try {
    const deadline = Date.now() + 5000;
    let ownsState = false;
    while (!ownsState && Date.now() < deadline) {
      try {
        const state = JSON.parse(await readFile(new URL('../.run/state.json', import.meta.url), 'utf8'));
        ownsState = state.pid === execution.child.pid;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!ownsState) await delay(10);
    }
    assert.equal(ownsState, true, execution.output());
    execution.child.kill('SIGINT');
    const result = await execution.exited;
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /KIPU_STOPPED/);
    for (const definition of definitions) await freePort(definition.port);
    await assert.rejects(readFile(new URL('../.run/state.json', import.meta.url)), { code: 'ENOENT' });
  } finally {
    if (execution.child.exitCode === null && execution.child.signalCode === null) {
      execution.child.kill('SIGTERM');
      await execution.exited;
    }
  }
});
