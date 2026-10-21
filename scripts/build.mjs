import './check-runtime.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function run(args, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Compilación fallida: código ${code}, señal ${signal}`));
    });
  });
}

try {
  await run([`${root}node_modules/typescript/bin/tsc`, '--build']);
  await run([`${root}node_modules/next/dist/bin/next`, 'build'], `${root}apps/kipu-web`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
