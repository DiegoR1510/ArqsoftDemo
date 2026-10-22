import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));

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

async function tokenForCreator(execution, suffix = Date.now()) {
  const registration = await fetch('http://127.0.0.1:4000/v1/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: `pipeline-${suffix}@example.test`, handle: `pipe${suffix % 100000}`, account_type: 'creator', terms_accepted: true }),
  });
  assert.equal(registration.status, 201);
  const registered = await registration.json();
  const deadline = Date.now() + 5000;
  let credentials;
  while (!credentials && Date.now() < deadline) {
    const match = [...execution.output().matchAll(/"event":"DEV_OTP","user_id":"([^"]+)","otp":"(\d{6})"/g)].find((candidate) => candidate[1] === registered.user_id);
    if (match) credentials = { user_id: match[1], otp: match[2] };
    else await delay(25);
  }
  assert.ok(credentials, execution.output());
  const response = await fetch('http://127.0.0.1:4000/v1/auth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials),
  });
  assert.equal(response.status, 201);
  return `Bearer ${(await response.json()).access_token}`;
}

const mp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]).toString('base64');

async function upload(title, authorization) {
  const response = await fetch('http://127.0.0.1:4000/v1/uploads', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ filename: `${title}.mp4`, content_type: 'video/mp4', content_base64: mp4, title }),
  });
  assert.equal(response.status, 201);
  const video = await response.json();
  const complete = await fetch(`http://127.0.0.1:4000/v1/uploads/${video.id}/complete`, { method: 'POST', headers: { authorization } });
  assert.equal(complete.status, 201);
  return video.id;
}

async function waitForVideo(id, authorization, expected, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let video;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:4000/v1/videos/${id}`, { headers: { authorization } });
    assert.equal(response.status, 200);
    video = await response.json();
    if (video.status === expected) return video;
    await delay(50);
  }
  assert.fail(`El video ${id} no llegó a ${expected}: ${JSON.stringify(video)}`);
}

async function drainObserver() {
  const events = [];
  for (;;) {
    const response = await fetch('http://127.0.0.1:4010/v1/consumers/pipeline-observer/test/next');
    if (response.status === 204) return events;
    assert.equal(response.status, 200);
    const delivery = await response.json();
    events.push(delivery.event);
    const confirmation = await fetch('http://127.0.0.1:4010/v1/consumers/pipeline-observer/test/confirm', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delivery_id: delivery.delivery_id }),
    });
    assert.equal(confirmation.status, 201);
  }
}

test('M2 4b: pipeline completo, moderación segura, reintentos e idempotencia', { timeout: 60000 }, async () => {
  try {
    const state = JSON.parse(await readFile(new URL('../.run/state.json', import.meta.url), 'utf8'));
    try { process.kill(state.pid, 0); assert.fail('Detén KIPU antes de ejecutar las pruebas.'); }
    catch (error) { if (error.name === 'AssertionError') throw error; }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const execution = execute('scripts/start.mjs');
  try {
    const deadline = Date.now() + 35000;
    while (!execution.output().includes('KIPU_READY') && Date.now() < deadline) await delay(100);
    assert.match(execution.output(), /KIPU_READY/, execution.output());
    const authorization = await tokenForCreator(execution);

    const publishedId = await upload('pipeline aprobado', authorization);
    await waitForVideo(publishedId, authorization, 'PUBLISHED');
    const playback = await fetch(`http://127.0.0.1:4000/v1/videos/${publishedId}/playback`, { headers: { authorization } });
    assert.equal(playback.status, 200);
    const playbackData = await playback.json();
    const media = await fetch(`http://127.0.0.1:4000${playbackData.url}`, { headers: { authorization } });
    assert.equal(media.status, 200);
    assert.equal((await media.arrayBuffer()).byteLength, 16);

    const timeoutId = await upload('moderación [timeout]', authorization);
    await waitForVideo(timeoutId, authorization, 'MODERATING');
    assert.equal((await fetch(`http://127.0.0.1:4000/v1/videos/${timeoutId}/playback`, { headers: { authorization } })).status, 409);

    const failedId = await upload('transcode [fallo-transcode]', authorization);
    const deadLetterDeadline = Date.now() + 5000;
    let deadLetters = [];
    while (Date.now() < deadLetterDeadline) {
      deadLetters = await (await fetch('http://127.0.0.1:4010/debug/dead-letters')).json();
      if (deadLetters.some((entry) => entry.event.payload.id === failedId && entry.attempts === 3)) break;
      await delay(100);
    }
    assert.ok(deadLetters.some((entry) => entry.event.payload.id === failedId && entry.attempts === 3), JSON.stringify(deadLetters));
    assert.equal((await (await fetch(`http://127.0.0.1:4000/v1/videos/${failedId}`, { headers: { authorization } })).json()).status, 'TRANSCODING');

    for (const key of ['duplicate-transcoded-a', 'duplicate-transcoded-b']) {
      const duplicate = await fetch('http://127.0.0.1:4010/v1/events', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'video.transcoded', payload: { video_id: publishedId, title: 'pipeline aprobado', owner_id: 'test' }, idempotency_key: key }),
      });
      assert.equal(duplicate.status, 201);
    }
    await delay(300);
    const publishedEvents = (await drainObserver()).filter((event) => event.type === 'video.published' && event.payload.video_id === publishedId);
    assert.equal(publishedEvents.length, 1);

    const rejectedId = await upload('moderación [rechazo]', authorization);
    await waitForVideo(rejectedId, authorization, 'REJECTED');
    assert.equal((await fetch(`http://127.0.0.1:4000/v1/videos/${rejectedId}/playback`, { headers: { authorization } })).status, 409);
    const reviewId = await upload('moderación [revision]', authorization);
    await waitForVideo(reviewId, authorization, 'MODERATING');
    assert.equal((await fetch(`http://127.0.0.1:4000/v1/videos/${reviewId}/playback`, { headers: { authorization } })).status, 409);
  } finally {
    try {
      const state = JSON.parse(await readFile(new URL('../.run/state.json', import.meta.url), 'utf8'));
      if (state.pid === execution.child.pid) await execute('scripts/stop.mjs').exited;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const result = await execution.exited;
    assert.equal(result.code, 0, result.output);
  }
});
