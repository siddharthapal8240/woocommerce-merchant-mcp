import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readConfig } from '../src/config.js';
import { WooClient, ConnectorError } from '../src/client.js';
import { createServer } from '../src/server.js';
const config = readConfig({
  WC_STORE_URL: 'https://shop.example',
  WC_CONSUMER_KEY: 'test-key',
  WC_CONSUMER_SECRET: 'test-secret',
});

test('HTTP-date Retry-After is respected; malformed values use jittered backoff', async () => {
  let count = 0;
  const delays: number[] = [];
  const future = new Date(Date.now() + 3000).toUTCString();
  const client = new WooClient(config, {
    fetch: async () =>
      ++count === 1
        ? new Response(null, { status: 429, headers: { 'Retry-After': future } })
        : count === 2
          ? new Response(null, { status: 503, headers: { 'Retry-After': 'invalid' } })
          : Response.json([]),
    sleep: async (ms) => {
      delays.push(ms);
    },
    random: () => 0.5,
  });
  await client.get('products');
  assert.ok(delays[0]! > 1000 && delays[0]! <= 3000);
  assert.equal(delays[1], 1125);
});

test('caller cancellation interrupts in-flight network calls safely', async () => {
  const controller = new AbortController();
  const client = new WooClient(config, {
    fetch: async (_input, init) => {
      controller.abort();
      init?.signal?.throwIfAborted();
      return Response.json([]);
    },
  });
  await assert.rejects(
    client.get('orders', {}, controller.signal),
    (error: unknown) => error instanceof ConnectorError && error.code === 'CANCELLED_OR_TIMEOUT',
  );
});

test('caller cancellation interrupts retry wait', async () => {
  const controller = new AbortController();
  const client = new WooClient(config, {
    fetch: async () => new Response(null, { status: 429 }),
    sleep: async (_ms, signal) => {
      controller.abort();
      signal?.throwIfAborted();
    },
  });
  await assert.rejects(
    client.get('orders', {}, controller.signal),
    (error: unknown) => error instanceof ConnectorError && error.code === 'CANCELLED_OR_TIMEOUT',
  );
});

test('invalid pagination headers are unknown, never fabricated totals', async () => {
  const client = new WooClient(config, {
    fetch: async () =>
      Response.json([], { headers: { 'x-wp-total': '-1', 'x-wp-totalpages': 'abc' } }),
  });
  assert.deepEqual(await client.get('orders'), { data: [], total: null, totalPages: null });
});

test('variant endpoint paths allowed; traversal, arbitrary paths and query injection denied', async () => {
  const client = new WooClient(config, { fetch: async () => Response.json({}) });
  await client.get('products/1/variations');
  await client.get('products/1/variations/2');
  for (const path of [
    'products/../customers',
    'customers',
    'orders/1?consumer_key=bad',
    'https://evil.test',
    'orders/1/variations',
  ]) {
    await assert.rejects(client.get(path), /Unsupported endpoint/);
  }
});

test('MCP malformed upstream records and failed auth become safe tool errors', async () => {
  let failure = false;
  const server = createServer(
    new WooClient(config, {
      fetch: async () =>
        failure
          ? new Response('test-secret', { status: 401 })
          : Response.json({ id: 'invalid', billing: { email: 'private@example.test' } }),
    }),
  );
  const client = new Client({ name: 'fault-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    const malformed = await client.callTool({ name: 'get_order', arguments: { id: 1 } });
    assert.equal(malformed.isError, true);
    assert.match(JSON.stringify(malformed), /INVALID_RESPONSE/);
    assert.ok(!JSON.stringify(malformed).includes('private@example.test'));
    failure = true;
    const auth = await client.callTool({ name: 'get_order', arguments: { id: 1 } });
    assert.equal(auth.isError, true);
    assert.match(JSON.stringify(auth), /AUTH_FAILED/);
    assert.ok(!JSON.stringify(auth).includes('test-secret'));
    for (const args of [{ per_page: 51 }, { page: 0 }, { unexpected: true }]) {
      assert.equal((await client.callTool({ name: 'list_orders', arguments: args })).isError, true);
    }
  } finally {
    await client.close();
    await server.close();
  }
});

test('oversized responses are bounded and rejected', async () => {
  const client = new WooClient(config, { fetch: async () => new Response('x'.repeat(1_048_577)) });
  await assert.rejects(
    client.get('products'),
    (error: unknown) => error instanceof ConnectorError && error.code === 'RESPONSE_TOO_LARGE',
  );
});

test('upstream projection asks only for allowed fields', async () => {
  const client = new WooClient(config, {
    fetch: async (input) => {
      const url = new URL(String(input));
      const fields = url.searchParams.get('_fields');
      assert.ok(fields?.includes('line_items'));
      assert.ok(!fields?.includes('billing'));
      assert.ok(!fields?.includes('customer_note'));
      return Response.json([]);
    },
  });
  await client.get('orders');
});
