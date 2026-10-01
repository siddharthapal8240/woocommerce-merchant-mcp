import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { harness, order } from '../support/harness.js';

test('MCP preserves eight tools, validates inputs, returns correlation IDs, errors and diagnostics', async () => {
  let calls = 0;
  const h = harness(async (input) => {
    calls++;
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/404')) return new Response('private', { status: 404 });
    return Response.json(path.endsWith('/42') ? order : [order], {
      headers: { 'x-wp-total': '2', 'x-wp-totalpages': '2' },
    });
  });
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await h.runtime.server.connect(b);
  await client.connect(a);
  try {
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 8);
    assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint));
    const list = await h.clock.settle(
      client.callTool({ name: 'list_orders', arguments: { per_page: 1 } }),
    );
    assert.equal(list.isError, undefined);
    assert.ok(!JSON.stringify(list).includes('private@example.test'));
    assert.match(JSON.stringify(list), /requestId/);
    const get = await h.clock.settle(client.callTool({ name: 'get_order', arguments: { id: 42 } }));
    assert.equal((get.structuredContent as { data: { number: string } }).data.number, '1042');
    const missing = await h.clock.settle(
      client.callTool({ name: 'get_order', arguments: { id: 404 } }),
    );
    assert.equal(missing.isError, true);
    assert.match(JSON.stringify(missing), /NOT_FOUND/);
    const before = calls;
    for (const args of [
      { per_page: 51 },
      { page: 0 },
      { storeUrl: 'https://evil.test' },
      { consumerKey: 'model-value' },
    ])
      assert.equal((await client.callTool({ name: 'list_orders', arguments: args })).isError, true);
    assert.equal((await client.callTool({ name: 'search_products', arguments: {} })).isError, true);
    assert.equal(
      (await client.callTool({ name: 'get_order', arguments: { id: -1 } })).isError,
      true,
    );
    assert.equal(calls, before);
    const metrics = await client.readResource({ uri: 'diagnostics://metrics' });
    assert.match(JSON.stringify(metrics), /maxActive/);
    assert.ok(!JSON.stringify(metrics).includes('test-secret'));
  } finally {
    await client.close();
    await h.runtime.close();
  }
});

test('MCP overload returns a safe correlated tool error while accepted work completes', async () => {
  let h: ReturnType<typeof harness>;
  h = harness(
    async (_url, init) => {
      await h.clock.sleep(100, init!.signal!);
      return Response.json(order);
    },
    { concurrency: 1, queueCapacity: 0 },
  );
  const client = new Client({ name: 'overload-test', version: '1.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await h.runtime.server.connect(b);
  await client.connect(a);
  try {
    const results = await h.clock.settle(
      Promise.all([1, 2].map((id) => client.callTool({ name: 'get_order', arguments: { id } }))),
    );
    assert.equal(results.filter((result) => result.isError).length, 1);
    const error = JSON.stringify(results.find((result) => result.isError));
    assert.match(error, /OVERLOADED/);
    assert.match(error, /requestId/);
  } finally {
    await client.close();
    await h.runtime.close();
  }
});
