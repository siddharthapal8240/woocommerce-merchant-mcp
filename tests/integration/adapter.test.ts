import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectorError } from '../../src/contracts/errors.js';
import { retryAfter } from '../../src/infrastructure/http.js';
import { harness, product, order } from '../support/harness.js';

test('adapter sends encoded filters and header auth to fixed endpoints; projects upstream fields', async () => {
  const h = harness(async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/shop/wp-json/wc/v3/products');
    assert.equal(url.searchParams.get('search'), 'blue & white');
    assert.ok(!url.href.includes('test-secret'));
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      `Basic ${Buffer.from('test-key:test-secret').toString('base64')}`,
    );
    assert.ok(!url.searchParams.get('_fields')?.includes('billing'));
    return Response.json([product], { headers: { 'x-wp-total': '1', 'x-wp-totalpages': '1' } });
  });
  try {
    const result = await h.clock.settle(
      h.runtime.inventory.search({ search: 'blue & white', page: 1, per_page: 10 }),
    );
    assert.equal(result.data[0]?.id, 1);
  } finally {
    await h.runtime.close();
  }
});
test('adapter classifies auth, missing records, upstream failures, invalid JSON/schema and network errors safely', async () => {
  for (const [status, code] of [
    [401, 'AUTH_FAILED'],
    [403, 'AUTH_FAILED'],
    [404, 'NOT_FOUND'],
    [500, 'UPSTREAM_ERROR'],
  ] as const) {
    let count = 0;
    const h = harness(async () => {
      count++;
      return new Response('test-secret', { status });
    });
    await assert.rejects(
      h.clock.settle(h.runtime.orders.get({ id: 1 })),
      (e: unknown) =>
        e instanceof ConnectorError &&
        e.code === code &&
        !!e.requestId &&
        !e.message.includes('test-secret'),
    );
    assert.equal(count, 1);
    await h.runtime.close();
  }
  for (const fetch of [
    async () => new Response('<html>'),
    async () => Response.json({ id: 'bad', secret: 'hidden' }),
  ]) {
    const h = harness(fetch);
    await assert.rejects(
      h.clock.settle(h.runtime.orders.get({ id: 1 })),
      (e: unknown) => e instanceof ConnectorError && e.code === 'INVALID_RESPONSE',
    );
    await h.runtime.close();
  }
  const h = harness(async () => {
    throw new Error('private URL with test-secret');
  });
  await assert.rejects(h.clock.settle(h.runtime.orders.get({ id: 1 })), /Unable to reach/);
  await h.runtime.close();
});
test('response byte bound rejects oversized bodies and releases response reader', async () => {
  let cancelled = false;
  const h = harness(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(2048));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    { maxResponseBytes: 1024 },
  );
  await assert.rejects(
    h.clock.settle(h.runtime.orders.get({ id: 1 })),
    (e: unknown) => e instanceof ConnectorError && e.code === 'RESPONSE_TOO_LARGE',
  );
  assert.equal(cancelled, true);
  await h.runtime.close();
});
test('pagination headers must be safe nonnegative integers', async () => {
  const h = harness(async () =>
    Response.json([order], {
      headers: { 'x-wp-total': '999999999999999999999', 'x-wp-totalpages': '-1' },
    }),
  );
  const result = await h.clock.settle(h.runtime.orders.list({ page: 1, per_page: 10 }));
  assert.equal(result.pagination.total, null);
  assert.equal(result.pagination.hasMore, null);
  await h.runtime.close();
});
test('Retry-After parses delta seconds, dates, past dates and malformed values without overflow', () => {
  assert.equal(retryAfter('1.5', 0), 1500);
  assert.equal(retryAfter(new Date(3000).toUTCString(), 1000), 2000);
  assert.equal(retryAfter(new Date(0).toUTCString(), 1000), 0);
  assert.equal(retryAfter('garbage', 0), undefined);
  assert.equal(retryAfter('-1', 0), undefined);
  assert.equal(retryAfter('9'.repeat(400), 0), Number.MAX_SAFE_INTEGER);
  assert.equal(retryAfter('9999999999999999999999', 0), Number.MAX_SAFE_INTEGER);
});
