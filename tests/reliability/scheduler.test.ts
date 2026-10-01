import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, flush, product } from '../support/harness.js';
import { burstScenario, cooldownScenario, cancellationScenario } from '../support/capacity.js';

test('100-request deterministic burst bounds concurrency and queue with explicit overload', async () => {
  await burstScenario();
});
test('Retry-After coordinates unrelated calls and retries with paced starts', async () => {
  await cooldownScenario();
});
test('queued and active cancellation frees slots, listeners and timers', async () => {
  await cancellationScenario();
});

test('FIFO admission and per-store start rate hold across overlapping operations', async () => {
  const starts: { id: string; at: number }[] = [];
  let h: ReturnType<typeof harness>;
  h = harness(
    async (input, init) => {
      starts.push({ id: new URL(String(input)).pathname.split('/').at(-1)!, at: h.clock.now() });
      await h.clock.sleep(100, init!.signal!);
      return Response.json(product);
    },
    { concurrency: 1, queueCapacity: 4, startsPerSecond: 5 },
  );
  await h.clock.settle(Promise.all([1, 2, 3, 4].map((id) => h.runtime.inventory.get({ id }))));
  assert.deepEqual(
    starts.map((item) => item.id),
    ['1', '2', '3', '4'],
  );
  assert.deepEqual(
    starts.map((item) => item.at),
    [0, 200, 400, 600],
  );
  await h.runtime.close();
  assert.equal(h.clock.pendingTimers, 0);
});
test('whole-operation deadline covers queued and active work, not a fresh HTTP timeout', async () => {
  let calls = 0;
  let h: ReturnType<typeof harness>;
  h = harness(
    async (_url, init) => {
      calls++;
      await h.clock.sleep(500, init!.signal!);
      return Response.json(product);
    },
    { concurrency: 1, queueCapacity: 1, deadlineMs: 100 },
  );
  const results = await h.clock.settle(
    Promise.allSettled([h.runtime.inventory.get({ id: 1 }), h.runtime.inventory.get({ id: 2 })]),
  );
  assert.ok(
    results.every(
      (result) => result.status === 'rejected' && result.reason.code === 'DEADLINE_EXCEEDED',
    ),
  );
  assert.equal(calls, 1);
  assert.equal(h.clock.now(), 100);
  assert.equal(h.clock.pendingTimers, 0);
  await h.runtime.close();
});
test('cancellation during coordinated cooldown cleans the wait timer', async () => {
  const h = harness(
    async () => new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
  );
  const controller = new AbortController();
  const work = h.runtime.inventory.get({ id: 1 }, controller.signal);
  const settled = Promise.allSettled([work]);
  await flush();
  controller.abort();
  const result = await h.clock.settle(settled);
  assert.equal(result[0]?.status, 'rejected');
  assert.equal(h.clock.pendingTimers, 0);
  await h.runtime.close();
});
test('long Retry-After fails fast and remains effective for later operations', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return new Response(null, { status: 429, headers: { 'Retry-After': '60' } });
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      h.clock.settle(h.runtime.inventory.get({ id: 1 })),
      (e: unknown) => (e as { code: string }).code === 'UPSTREAM_BUSY',
    );
  assert.equal(calls, 1);
  assert.equal(h.clock.now(), 0);
  await h.runtime.close();
});
test('retry jitter and exhaustion remain bounded across three transient attempts', async () => {
  const starts: number[] = [];
  let h: ReturnType<typeof harness>;
  h = harness(async () => {
    starts.push(h.clock.now());
    return new Response(null, { status: 502 });
  });
  await assert.rejects(
    h.clock.settle(h.runtime.inventory.get({ id: 1 })),
    (e: unknown) => (e as { code: string }).code === 'UPSTREAM_BUSY',
  );
  assert.deepEqual(starts, [0, 625, 1750]);
  assert.equal(h.runtime.diagnostics().metrics.retries, 2);
  await h.runtime.close();
});
test('shutdown cancels queued/active work, closes owned transport once, and rejects new work', async () => {
  let h: ReturnType<typeof harness>;
  h = harness(
    async (_url, init) => {
      await h.clock.sleep(1000, init!.signal!);
      return Response.json(product);
    },
    { concurrency: 1, queueCapacity: 2 },
  );
  const requests = Promise.allSettled([
    h.runtime.inventory.get({ id: 1 }),
    h.runtime.inventory.get({ id: 2 }),
  ]);
  await flush();
  await h.clock.settle(h.runtime.close());
  await h.runtime.close();
  const results = await requests;
  assert.ok(
    results.every(
      (result) => result.status === 'rejected' && result.reason.code === 'SHUTTING_DOWN',
    ),
  );
  await assert.rejects(h.runtime.inventory.get({ id: 3 }), /shutting down/);
  assert.equal(h.closes(), 1);
  assert.equal(h.clock.pendingTimers, 0);
  assert.equal(h.runtime.diagnostics().metrics.active, 0);
});

test('deadline also covers a slow response body after headers arrive', async () => {
  let h: ReturnType<typeof harness>;
  h = harness(
    async (_url, init) =>
      new Response(
        new ReadableStream({
          async start(controller) {
            try {
              await h.clock.sleep(1000, init!.signal!);
              controller.enqueue(new TextEncoder().encode(JSON.stringify(product)));
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        }),
      ),
    { deadlineMs: 100 },
  );
  await assert.rejects(
    h.clock.settle(h.runtime.inventory.get({ id: 1 })),
    (e: unknown) => (e as { code: string }).code === 'DEADLINE_EXCEEDED',
  );
  assert.equal(h.clock.pendingTimers, 0);
  await h.runtime.close();
});

test('zero queue capacity rejects overflow without starting work; pre-cancelled calls allocate no timers', async () => {
  let h: ReturnType<typeof harness>;
  h = harness(
    async (_url, init) => {
      await h.clock.sleep(100, init!.signal!);
      return Response.json(product);
    },
    { concurrency: 1, queueCapacity: 0 },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(h.runtime.inventory.get({ id: 1 }, controller.signal), /cancelled/);
  assert.equal(h.clock.pendingTimers, 0);
  const first = h.runtime.inventory.get({ id: 1 });
  await assert.rejects(h.runtime.inventory.get({ id: 2 }), /capacity/);
  await h.clock.settle(first);
  await h.runtime.close();
});

test('503 Retry-After coordinates the store just like 429', async () => {
  await cooldownScenario(503);
});

test('shutdown itself has a deadline even if a transport fails to close', async () => {
  const { createConnector } = await import('../../src/bootstrap.js');
  const { readConfig } = await import('../../src/config.js');
  const { ManualClock } = await import('../support/harness.js');
  const clock = new ManualClock();
  const config = readConfig({
    WC_STORE_URL: 'https://test.example',
    WC_CONSUMER_KEY: 'test',
    WC_CONSUMER_SECRET: 'test',
    WC_SHUTDOWN_MS: '100',
  });
  const runtime = createConnector(config, {
    clock,
    transport: { fetch, close: () => new Promise(() => {}) },
  });
  await assert.rejects(clock.settle(runtime.close()), /Shutdown deadline/);
  assert.equal(clock.pendingTimers, 0);
});
