import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(\w):/, '$1:').replaceAll('/', '\\');

function execute(script) {
  const child = spawn(process.execPath, [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve({ code, output })); });
  return { child, exited, output: () => output };
}

async function seedIdentity() {
  const response = await fetch('http://127.0.0.1:4001/v1/auth/internal/demo/seed', { method: 'POST' });
  assert.equal(response.status, 201);
  return (await response.json()).creators;
}

async function request(path, token, init = {}) {
  const response = await fetch(`http://127.0.0.1:4000${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  return { response, body: await response.json().catch(() => undefined) };
}

test('Paso 6: social idempotente, bloqueo, notificaciones y siguiendo', { timeout: 60000 }, async () => {
  const execution = execute('scripts/start.mjs');
  try {
    const deadline = Date.now() + 35000;
    while (!execution.output().includes('KIPU_READY') && Date.now() < deadline) await delay(100);
    assert.match(execution.output(), /KIPU_READY/);
    const [first, second] = await seedIdentity();
    await delay(500);

    const follow = await request('/v1/social/follow/demo-creator-1', second.token, { method: 'POST' });
    assert.equal(follow.response.status, 201);
    const followingDeadline = Date.now() + 4000;
    let following;
    while (Date.now() < followingDeadline) {
      following = await request('/v1/feed/following', second.token);
      if (following.body.items.some((item) => item.creator_id === first.id)) break;
      await delay(50);
    }
    assert.equal(following.response.status, 200);
    assert.ok(following.body.items.some((item) => item.creator_id === first.id));

    const firstLike = await request('/v1/social/videos/demo-video-3/like', second.token, { method: 'POST', body: JSON.stringify({ owner_id: first.id }) });
    const duplicateLike = await request('/v1/social/videos/demo-video-3/like', second.token, { method: 'POST', body: JSON.stringify({ owner_id: first.id }) });
    assert.equal(firstLike.body.count, 1);
    assert.equal(duplicateLike.body.count, 1);
    const counters = await request('/v1/social/counters/batch', second.token, { method: 'POST', body: JSON.stringify({ video_ids: ['demo-video-3'] }) });
    assert.deepEqual(counters.body.counters, [{ video_id: 'demo-video-3', likes: 1, comments: 0 }]);

    const comment = await request('/v1/social/videos/demo-video-3/comments', second.token, { method: 'POST', body: JSON.stringify({ owner_id: first.id, text: 'Comentario visible' }) });
    assert.equal(comment.response.status, 201);
    const block = await request('/v1/social/block/demo-creator-2', first.token, { method: 'POST' });
    assert.equal(block.response.status, 201);
    assert.equal((await request('/v1/social/follow/demo-creator-1', second.token, { method: 'POST' })).response.status, 403);
    assert.equal((await request('/v1/social/videos/demo-video-3/comments', second.token, { method: 'POST', body: JSON.stringify({ owner_id: first.id, text: 'Bloqueado' }) })).response.status, 403);
    const visibleComments = await request('/v1/social/videos/demo-video-3/comments', first.token);
    assert.equal(visibleComments.body.length, 0);

    const duplicatedEvent = { type: 'social.liked', payload: { actor_id: second.id, recipient_id: first.id, video_id: 'demo-video-2' }, idempotency_key: 'test.notification.duplicate' };
    await fetch('http://127.0.0.1:4010/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(duplicatedEvent) });
    await fetch('http://127.0.0.1:4010/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(duplicatedEvent) });
    const notificationDeadline = Date.now() + 4000;
    let notifications = [];
    while (Date.now() < notificationDeadline) {
      notifications = (await request('/v1/notifications', first.token)).body;
      if (notifications.some((item) => item.video_id === 'demo-video-2')) break;
      await delay(50);
    }
    assert.equal(notifications.filter((item) => item.video_id === 'demo-video-2').length, 1);
  } finally {
    await execute('scripts/stop.mjs').exited;
    const result = await execution.exited;
    assert.equal(result.code, 0, result.output);
  }
});
