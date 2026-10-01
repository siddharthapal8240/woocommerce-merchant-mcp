import { getEventListeners } from 'node:events';
import assert from 'node:assert/strict';
import { ConnectorError } from '../../src/contracts/errors.js';
import { harness, flush, product } from './harness.js';

export async function burstScenario() {
  let inFlight = 0;
  let maxInFlight = 0;
  let h: ReturnType<typeof harness>;
  h = harness(
    async (_url, init) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await h.clock.sleep(100, init!.signal!);
        return Response.json(product);
      } finally {
        inFlight--;
      }
    },
    { concurrency: 4, queueCapacity: 16, startsPerSecond: 50, deadlineMs: 2000 },
  );
  const results = await h.clock.settle(
    Promise.allSettled(Array.from({ length: 100 }, () => h.runtime.inventory.get({ id: 1 }))),
  );
  const fulfilled = results.filter((item) => item.status === 'fulfilled').length;
  const overloads = results.filter(
    (item) =>
      item.status === 'rejected' &&
      item.reason instanceof ConnectorError &&
      item.reason.code === 'OVERLOADED',
  ).length;
  const metrics = h.runtime.diagnostics().metrics;
  assert.equal(fulfilled, 20);
  assert.equal(overloads, 80);
  assert.equal(maxInFlight, 4);
  assert.equal(metrics.maxQueued, 16);
  assert.equal(metrics.active, 0);
  assert.equal(metrics.queued, 0);
  assert.equal(h.clock.pendingTimers, 0);
  await h.runtime.close();
  return {
    offered: 100,
    succeeded: fulfilled,
    overloaded: overloads,
    maxInFlight,
    maxQueue: metrics.maxQueued,
    virtualDurationMs: h.clock.now(),
    pendingTimersAfter: h.clock.pendingTimers,
    configured: h.config.limits,
  };
}
export async function cooldownScenario(status = 429) {
  const starts: number[] = [];
  let h: ReturnType<typeof harness>;
  h = harness(
    async () => {
      starts.push(h.clock.now());
      return starts.length === 1
        ? new Response(null, { status, headers: { 'Retry-After': '1' } })
        : Response.json(product);
    },
    { concurrency: 2, queueCapacity: 2, startsPerSecond: 50 },
  );
  const requests = Promise.all([
    h.runtime.inventory.get({ id: 1 }),
    h.runtime.inventory.get({ id: 2 }),
  ]);
  await flush();
  await h.clock.advance(999);
  assert.deepEqual(starts, [0]);
  await h.clock.settle(requests);
  assert.equal(starts.length, 3);
  assert.ok(starts.slice(1).every((time) => time >= 1000));
  assert.ok(starts[2]! - starts[1]! >= 20);
  const metrics = h.runtime.diagnostics().metrics;
  assert.equal(metrics.retries, 1);
  assert.equal(h.clock.pendingTimers, 0);
  await h.runtime.close();
  return {
    retryAfterMs: 1000,
    upstreamStartTimesMs: starts,
    retries: metrics.retries,
    throttles: metrics.throttles,
    pendingTimersAfter: h.clock.pendingTimers,
  };
}
export async function cancellationScenario() {
  let h: ReturnType<typeof harness>;
  let calls = 0;
  h = harness(
    async (_url, init) => {
      calls++;
      await h.clock.sleep(500, init!.signal!);
      return Response.json(product);
    },
    { concurrency: 1, queueCapacity: 2 },
  );
  const active = new AbortController();
  const queued = new AbortController();
  const resultsPromise = Promise.allSettled([
    h.runtime.inventory.get({ id: 1 }, active.signal),
    h.runtime.inventory.get({ id: 2 }, queued.signal),
    h.runtime.inventory.get({ id: 3 }),
  ]);
  await flush();
  queued.abort();
  active.abort();
  const results = await h.clock.settle(resultsPromise);
  assert.equal(
    results.filter((item) => item.status === 'rejected' && item.reason.code === 'CANCELLED').length,
    2,
  );
  assert.equal(results[2]?.status, 'fulfilled');
  assert.equal(calls, 2);
  assert.equal(getEventListeners(active.signal, 'abort').length, 0);
  assert.equal(getEventListeners(queued.signal, 'abort').length, 0);
  assert.equal(h.clock.pendingTimers, 0);
  await h.runtime.close();
  return {
    activeAndQueuedCancelled: 2,
    remainingSucceeded: 1,
    upstreamCalls: calls,
    pendingTimersAfter: h.clock.pendingTimers,
  };
}
