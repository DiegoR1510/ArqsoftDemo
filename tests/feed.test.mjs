import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function execute(script, root) {
  const child = spawn(process.execPath, [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve({ code, output })); });
  return { child, exited, output: () => output };
}

const root = new URL('../', import.meta.url).pathname.replace(/^\/(\w):/, '$1:').replaceAll('/', '\\');

async function createToken(execution) {
  const suffix = Date.now();
  const registration = await fetch('http://127.0.0.1:4000/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: `feed-${suffix}@example.test`, handle: `feed${suffix % 100000}`, terms_accepted: true }) });
  assert.equal(registration.status, 201);
  const user = await registration.json();
  const deadline = Date.now() + 5000;
  let credentials;
  while (!credentials && Date.now() < deadline) {
    const match = [...execution.output().matchAll(/"event":"DEV_OTP","user_id":"([^"]+)","otp":"(\d{6})"/g)].find((candidate) => candidate[1] === user.user_id);
    if (match) credentials = { user_id: match[1], otp: match[2] };
    else await delay(25);
  }
  assert.ok(credentials, execution.output());
  const token = await fetch('http://127.0.0.1:4000/v1/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
  return `Bearer ${(await token.json()).access_token}`;
}

async function feed(token, cursor = '') {
  const response = await fetch(`http://127.0.0.1:4000/v1/feed?limit=10&cursor=${cursor}`, { headers: { authorization: token } });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitForFeed(token) {
  const deadline = Date.now() + 5000;
  let result;
  while (Date.now() < deadline) {
    result = await feed(token);
    if (result.items.length === 10 && result.next_cursor) return result;
    await delay(50);
  }
  return result;
}

test('Paso 5: feed paginado, eventos publicados, fallback, anuncios y reglas versionadas', { timeout: 60000 }, async () => {
  const execution = execute('scripts/start.mjs', root);
  try {
    const deadline = Date.now() + 35000;
    while (!execution.output().includes('KIPU_READY') && Date.now() < deadline) await delay(100);
    assert.match(execution.output(), /KIPU_READY/);
    const token = await createToken(execution);
    let first = await waitForFeed(token);
    const published = first.items.filter((item) => item.kind === 'video');
    assert.ok(published.length > 0, JSON.stringify(first));
    assert.equal(first.degraded, false);
    assert.equal(first.ruleset_version, 'rk-2026.10.json');
    assert.ok(first.next_cursor);
    assert.equal((await feed(token, first.next_cursor)).ruleset_version, 'rk-2026.10.json');

    const search = await (await fetch('http://127.0.0.1:4000/v1/search?hashtag=demo')).json();
    assert.equal(search.items.length, 0);
    const nature = await (await fetch('http://127.0.0.1:4000/v1/search?hashtag=naturaleza')).json();
    assert.ok(nature.items.every((item) => item.status === 'PUBLISHED'));

    await fetch('http://127.0.0.1:4011/internal/ranking/mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ failing: true }) });
    const degraded = await feed(token);
    assert.equal(degraded.degraded, true);
    assert.equal(degraded.ruleset_version, 'fallback-recent-popular');
    await fetch('http://127.0.0.1:4011/internal/ranking/mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ failing: false }) });
    await delay(1100);
    assert.equal((await feed(token)).degraded, false);

    await fetch('http://127.0.0.1:4020/internal/ad-server/latency', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latency_ms: 120 }) });
    const slowAds = await feed(token);
    assert.equal(slowAds.items[3]?.kind, 'video');
    const metrics = await (await fetch('http://127.0.0.1:4003/internal/metrics')).json();
    assert.ok(metrics.ad_fallbacks > 0, JSON.stringify(metrics));
    await fetch('http://127.0.0.1:4020/internal/ad-server/latency', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latency_ms: 5 }) });

    const rulesetChange = await fetch('http://127.0.0.1:4011/internal/ranking/ruleset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'rk-2026.11.json' }) });
    assert.equal(rulesetChange.status, 201);
    assert.equal((await rulesetChange.json()).ruleset_version, 'rk-2026.11.json');
    const changed = await feed(token);
    assert.equal(changed.ruleset_version, 'rk-2026.11.json');
    assert.notDeepEqual(changed.items.filter((item) => item.kind === 'video').map((item) => item.id), first.items.filter((item) => item.kind === 'video').map((item) => item.id));
    const restoreRuleset = await fetch('http://127.0.0.1:4011/internal/ranking/ruleset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'rk-2026.10.json' }) });
    assert.equal(restoreRuleset.status, 201);
  } finally {
    await execute('scripts/stop.mjs', root).exited;
    const result = await execution.exited;
    assert.equal(result.code, 0, result.output);
  }
});
