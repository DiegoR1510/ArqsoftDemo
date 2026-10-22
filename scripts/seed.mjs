import './check-runtime.mjs';

const identity = await fetch('http://127.0.0.1:4001/v1/auth/internal/demo/seed', { method: 'POST' });
const response = await fetch('http://127.0.0.1:4002/v1/internal/demo/seed', { method: 'POST' });
if (!identity.ok || !response.ok) {
  console.error(`No se pudo sembrar la demo: identity=${identity.status} media=${response.status}`);
  process.exitCode = 1;
} else {
  const identityData = await identity.json();
  const mediaData = await response.json();
  if (!mediaData.skipped) {
    const [first, second] = identityData.creators;
    const headers = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
    await fetch('http://127.0.0.1:4000/v1/social/follow/demo-creator-1', { method: 'POST', headers: headers(second.token) });
    await fetch('http://127.0.0.1:4000/v1/social/follow/demo-creator-2', { method: 'POST', headers: headers(first.token) });
    await fetch('http://127.0.0.1:4000/v1/social/videos/demo-video-1/like', { method: 'POST', headers: headers(second.token) });
    await fetch('http://127.0.0.1:4000/v1/social/videos/demo-video-2/like', { method: 'POST', headers: headers(first.token) });
    await fetch('http://127.0.0.1:4000/v1/social/videos/demo-video-1/comments', { method: 'POST', headers: headers(second.token), body: JSON.stringify({ text: 'Comentario de demo' }) });
  }
  console.log(`KIPU_SEED ${JSON.stringify({ media: mediaData, social: mediaData.skipped ? 'skipped' : 'created' })}`);
}
