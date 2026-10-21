import test from 'node:test';
import assert from 'node:assert/strict';
import { EventDeduplicator } from '../packages/events/dist/index.js';
import { EventBusService } from '../apps/event-bus/dist/event-bus.service.js';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('un consumidor falla, recibe reentrega al recuperarse y aplica el efecto una sola vez', async () => {
  const bus = new EventBusService();
  const dedupe = new EventDeduplicator();
  let effects = 0;
  bus.publish({ type: 'social.liked', payload: { video_id: 'v-1' }, idempotency_key: 'like-1', trace_id: 'trace-1' });
  const first = bus.consume({ group: 'ranking', consumer: 'ranking-1' });
  assert.equal(first.attempt, 1);
  await wait(275);
  const retry = bus.consume({ group: 'ranking', consumer: 'ranking-1' });
  assert.equal(retry.attempt, 2);
  assert.equal(dedupe.process(retry.event, () => { effects += 1; }), true);
  bus.confirm({ group: 'ranking', consumer: 'ranking-1' }, retry.delivery_id);
  assert.equal(effects, 1);
  assert.equal(bus.consume({ group: 'ranking', consumer: 'ranking-1' }), null);
});

test('publicar dos veces el mismo evento por idempotency_key produce un solo efecto', () => {
  const bus = new EventBusService();
  const dedupe = new EventDeduplicator();
  let effects = 0;
  const input = { type: 'social.liked', payload: { video_id: 'v-2' }, idempotency_key: 'like-2' };
  const first = bus.publish(input);
  const duplicate = bus.publish(input);
  assert.equal(duplicate.event_id, first.event_id);
  const delivery = bus.consume({ group: 'notifications', consumer: 'notifications-1' });
  assert.equal(dedupe.process(delivery.event, () => { effects += 1; }), true);
  assert.equal(dedupe.process(delivery.event, () => { effects += 1; }), false);
  assert.equal(effects, 1);
});

test('un grupo puede avanzar sin mover el cursor de otro grupo', () => {
  const bus = new EventBusService();
  bus.publish({ type: 'social.liked', payload: {}, idempotency_key: 'like-3' });
  const ranking = bus.consume({ group: 'ranking', consumer: 'r' });
  bus.confirm({ group: 'ranking', consumer: 'r' }, ranking.delivery_id);
  assert.equal(bus.consume({ group: 'ranking', consumer: 'r' }), null);
  assert.equal(bus.consume({ group: 'notifications', consumer: 'n' }).event.idempotency_key, 'like-3');
});

test('una entrega agotada queda consultable en dead-letter', async () => {
  const bus = new EventBusService();
  bus.publish({ type: 'social.liked', payload: {}, idempotency_key: 'like-dead' });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await wait(275);
    assert.equal(bus.consume({ group: 'failed-consumer', consumer: 'worker' }).attempt, attempt);
  }
  await wait(275);
  assert.equal(bus.consume({ group: 'failed-consumer', consumer: 'worker' }), null);
  assert.deepEqual(bus.getDeadLetters().map((entry) => ({ group: entry.group, attempts: entry.attempts })), [{ group: 'failed-consumer', attempts: 3 }]);
});
