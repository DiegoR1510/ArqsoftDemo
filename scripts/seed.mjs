import './check-runtime.mjs';

const response = await fetch('http://127.0.0.1:4002/v1/internal/demo/seed', { method: 'POST' });
if (!response.ok) {
  console.error(`No se pudo sembrar la demo: HTTP ${response.status}`);
  process.exitCode = 1;
} else {
  console.log(`KIPU_SEED ${JSON.stringify(await response.json())}`);
}
