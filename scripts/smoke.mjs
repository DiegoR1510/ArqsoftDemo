import './check-runtime.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(\w):/, '$1:').replaceAll('/', '\\');
function execute(script) {
  const child = spawn(process.execPath, [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DEMO_MODE: 'true' } });
  let output = ''; child.stdout.on('data', (data) => { output += data; process.stdout.write(data); }); child.stderr.on('data', (data) => { output += data; process.stderr.write(data); });
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve({ code, output })); });
  return { child, exited, output: () => output };
}
async function request(path, token, init = {}) { const response = await fetch(`http://127.0.0.1:4000${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) } }); return { response, body: await response.json().catch(() => undefined) }; }
function ok(name, condition) { if (!condition) throw new Error(`FALLO: ${name}`); console.log(`OK: ${name}`); }

await execute('scripts/stop.mjs').exited;
const execution = execute('scripts/start.mjs');
try {
  const deadline = Date.now() + 35000; while (!execution.output().includes('KIPU_READY') && Date.now() < deadline) await delay(100);
  ok('arranque', execution.output().includes('KIPU_READY'));
  const seed = await request('/v1/auth/demo/seed', undefined, { method: 'POST' }); console.log(`SEED_STATUS=${seed.response.status} SEED_CREATORS=${seed.body?.creators?.length ?? 0} SEED_ERROR=${seed.body?.message ?? ''}`); ok('entrar como demo', seed.response.status === 201 && seed.body?.creators?.length === 2);
  const first = seed.body.creators[0]; const second = seed.body.creators[1];
  const feedDeadline = Date.now() + 5000; let feed;
  while (Date.now() < feedDeadline) { feed = await request('/v1/feed?limit=10', first.token); if (feed.response.ok && feed.body.items?.some((item) => item.kind === 'video')) break; await delay(100); }
  ok('ver feed', feed?.response.ok && feed.body.items.some((item) => item.kind === 'video'));
  const socialDeadline = Date.now() + 5000; let like;
  while (Date.now() < socialDeadline) { like = await request('/v1/social/videos/demo-video-3/like', second.token, { method: 'POST' }); if (like.response.status === 201) break; await delay(100); }
  console.log(`LIKE_STATUS=${like.response.status} LIKE_COUNT=${like.body?.count ?? 0} LIKE_ERROR=${like.body?.message ?? ''}`); ok('like', like.response.status === 201 && like.body?.count >= 1);
  let comment;
  while (Date.now() < socialDeadline) { comment = await request('/v1/social/videos/demo-video-3/comments', second.token, { method: 'POST', body: JSON.stringify({ text: 'Smoke de Paso 8' }) }); if (comment.response.status === 201) break; await delay(100); }
  ok('comentario', comment.response.status === 201);
  const notificationDeadline = Date.now() + 5000; let notifications = [];
  while (Date.now() < notificationDeadline) { const result = await request('/v1/notifications', first.token); notifications = result.body ?? []; if (notifications.some((item) => item.video_id === 'demo-video-3')) break; await delay(100); }
  ok('notificación', notifications.some((item) => item.video_id === 'demo-video-3'));
  console.log('SMOKE_OK');
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
finally { await execute('scripts/stop.mjs').exited; await execution.exited; }
