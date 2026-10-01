import { z } from 'zod';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connect } from '../scripts/mcp-client.js';
import { localApi, secrets, storeUrl } from '../scripts/local.js';

test('real WooCommerce: stdio discovery, list/get/search, stock, variants, auth and read-only permissions', async () => {
  const fixtures = JSON.parse(await readFile('.local/fixtures.json', 'utf8')) as {
    products: Record<string, number>;
    orders: Record<string, number>;
  };
  const client = await connect();
  try {
    assert.equal((await client.listTools()).tools.length, 8);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`);
      assert.ok(result.structuredContent);
      return z
        .object({ data: z.unknown(), pagination: z.unknown().optional() })
        .parse(result.structuredContent);
    };
    const orders = await call('list_orders', { per_page: 1, status: 'processing' });
    assert.equal((orders.data as unknown[]).length, 1);
    assert.equal((orders.pagination as { nextPage: number }).nextPage, 2);
    assert.equal((orders.pagination as { total: number }).total, 2);
    const allProducts = await call('list_products', {});
    assert.equal((allProducts.pagination as { total: number }).total, 5);
    const page2 = await call('list_orders', { per_page: 1, page: 2, status: 'processing' });
    assert.notDeepEqual(page2.data, orders.data);
    const order = await call('get_order', { id: fixtures.orders['demo-ready'] });
    assert.equal((order.data as { status: string }).status, 'processing');
    assert.ok(!JSON.stringify(order).includes('@example.test'));
    assert.ok(!JSON.stringify(order).includes('customer_note'));
    const orderSearch = await call('search_orders', { search: 'demo-ready' });
    assert.ok(
      (orderSearch.data as Array<{ id: number }>).some(
        (item) => item.id === fixtures.orders['demo-ready'],
      ),
    );
    const products = await call('list_products', { stock_status: 'outofstock' });
    assert.ok(
      (products.data as Array<{ id: number }>).some(
        (item) => item.id === fixtures.products['DEMO-TOTE'],
      ),
    );
    const search = await call('search_products', { sku: 'DEMO-BLUE-TEE' });
    assert.equal((search.data as Array<{ id: number }>)[0]?.id, fixtures.products['DEMO-BLUE-TEE']);
    const textSearch = await call('search_products', { search: 'Ceramic' });
    assert.ok(
      (textSearch.data as Array<{ id: number }>).some(
        (item) => item.id === fixtures.products['DEMO-MUG'],
      ),
    );
    const product = await call('get_product', { id: fixtures.products['DEMO-BLUE-TEE'] });
    assert.equal((product.data as { stock_quantity: number }).stock_quantity, 12);
    const untracked = await call('get_product', { id: fixtures.products['DEMO-WRAP'] });
    assert.equal((untracked.data as { stock_quantity: null }).stock_quantity, null);
    const variants = await call('list_product_variations', {
      product_id: fixtures.products['DEMO-HOODIE'],
    });
    assert.equal((variants.data as unknown[]).length, 2);
    const variant = await call('get_product_variation', {
      product_id: fixtures.products['DEMO-HOODIE'],
      variation_id: fixtures.products['DEMO-HOODIE-L'],
    });
    assert.equal((variant.data as { stock_status: string }).stock_status, 'outofstock');
    const missing = await client.callTool({ name: 'get_order', arguments: { id: 99999999 } });
    assert.equal(missing.isError, true);
    assert.match(JSON.stringify(missing.content), /NOT_FOUND/);
    const unknown = await call('search_products', { sku: 'DEMO-NONEXISTENT' });
    assert.deepEqual(unknown.data, []);
    const key = await secrets();
    const invalid = await localApi('orders', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${key.readKey}:invalid`).toString('base64')}`,
      },
    });
    assert.equal(invalid.status, 401);
    // Read-only key must deny a real mutation; setting an existing value would be harmless even if a regression allowed it.
    const forbidden = await localApi(`products/${fixtures.products['DEMO-BLUE-TEE']}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Blue Everyday T-shirt' }),
    });
    assert.equal(forbidden.status, 401);
  } finally {
    await client.close();
  }
});
