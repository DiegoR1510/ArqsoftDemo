import test from 'node:test';
import assert from 'node:assert/strict';
import { requireDemoMode } from '../apps/api-gateway/dist/demo-mode.js';

test('la puerta de demo exige DEMO_MODE=true', () => {
  const previous = process.env.DEMO_MODE;
  try {
    process.env.DEMO_MODE = 'true';
    assert.doesNotThrow(() => requireDemoMode());
    process.env.DEMO_MODE = 'false';
    assert.throws(() => requireDemoMode(), (error) => error?.status === 404);
    delete process.env.DEMO_MODE;
    assert.throws(() => requireDemoMode(), (error) => error?.status === 404);
  } finally {
    if (previous === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previous;
  }
});
