import './check-runtime.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const stateFile = new URL('../.run/state.json', import.meta.url);
const stopFile = new URL('../.run/stop.json', import.meta.url);

try {
  let state;
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') {
      console.log('KIPU no está iniciado.');
      process.exit(0);
    }
    throw error;
  }
  await writeFile(stopFile, JSON.stringify({ runId: state.runId }));
  const deadline = Date.now() + 15000;
  let done = false;
  while (Date.now() < deadline) {
    try {
      const current = JSON.parse(await readFile(stateFile, 'utf8'));
      if (current.runId !== state.runId) throw new Error('Cambió la ejecución activa de KIPU.');
    } catch (error) {
      if (error.code === 'ENOENT') { done = true; break; }
      throw error;
    }
    await delay(200);
  }
  if (!done) throw new Error('No se confirmó la parada. Revisa la terminal de npm start.');
  console.log('KIPU detenido: todos los procesos finalizaron.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
