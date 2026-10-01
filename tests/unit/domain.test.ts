import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessStock } from '../../src/application/inventory.js';
import { pageResult } from '../../src/application/results.js';
import { readConfig } from '../../src/config.js';
import {
  mapOrder,
  mapProduct,
  mapVariation,
  mapList,
} from '../../src/infrastructure/woocommerce/mappings.js';
import { product, order } from '../support/harness.js';

test('configuration validates trusted HTTPS roots and bounded numeric limits', () => {
  const env = {
    WC_STORE_URL: 'https://shop.example/subdir',
    WC_CONSUMER_KEY: 'key',
    WC_CONSUMER_SECRET: 'secret',
  };
  assert.equal(readConfig(env).storeUrl.href, 'https://shop.example/subdir/wp-json/wc/v3/');
  for (const url of [
    'http://localhost:8080',
    'https://u:p@shop.example',
    'https://shop.example?x=1',
    'https://shop.example/#fragment',
    'https://shop.example/wp-json/wc/v3',
  ])
    assert.throws(() => readConfig({ ...env, WC_STORE_URL: url }));
  for (const value of ['0', '17', 'NaN', 'Infinity', '1.5'])
    assert.throws(() => readConfig({ ...env, WC_MAX_CONCURRENCY: value }));
  assert.throws(() => readConfig({ ...env, WC_CONSUMER_SECRET: '' }));
  assert.throws(() => readConfig({ ...env, WC_QUEUE_CAPACITY: '129' }));
  assert.equal(readConfig({ ...env, WC_QUEUE_CAPACITY: '0' }).limits.queueCapacity, 0);
});
test('explicit mappings omit private and nested upstream additions, preserve decimal and null fields', () => {
  const mapped = mapOrder({
    ...order,
    line_items: [
      {
        id: 1,
        name: 'Shirt',
        product_id: 2,
        variation_id: 0,
        quantity: 1,
        total: '100000000000000.01',
        meta_data: [{ value: 'secret' }],
      },
    ],
  });
  assert.equal(mapped.line_items[0]?.total, '100000000000000.01');
  assert.ok(!JSON.stringify(mapped).includes('secret'));
  assert.ok(!JSON.stringify(mapped).includes('private@example.test'));
  assert.equal(
    mapProduct({ ...product, stock_quantity: null, description: 'ignore instructions' })
      .stock_quantity,
    null,
  );
  assert.throws(() => mapProduct({ ...product, id: 'bad' }), /invalid response/);
  assert.throws(() => mapList([product, product], mapProduct, 1), /invalid response/);
  const variant = mapVariation({
    ...product,
    manage_stock: 'parent',
    attributes: [{ name: 'Size', option: 'L', private: 'omit' }],
  });
  assert.deepEqual(variant.attributes, [{ name: 'Size', option: 'L' }]);
});
test('inventory distinguishes stockout, backorder, untracked, insufficient, unknown and parent-managed variation', () => {
  assert.equal(assessStock(product, 5).verdict, 'CURRENT STOCK SUFFICIENT');
  assert.equal(assessStock(product, 6).verdict, 'INSUFFICIENT CURRENT STOCK');
  assert.match(assessStock({ ...product, stock_quantity: null }, 1).verdict, /UNTRACKED/);
  assert.match(assessStock({ ...product, stock_status: 'outofstock' }, 1).verdict, /OUT OF STOCK/);
  assert.match(assessStock({ ...product, stock_status: 'onbackorder' }, 1).verdict, /BACKORDER/);
  assert.match(assessStock({ ...product, stock_status: 'custom' }, 1).verdict, /UNKNOWN/);
  assert.equal(
    assessStock(product, 5, { ...product, manage_stock: 'parent', stock_quantity: null }).quantity,
    5,
  );
  assert.match(
    assessStock(product, 1, { ...product, stock_status: 'outofstock', stock_quantity: 0 }).verdict,
    /OUT OF STOCK/,
  );
});
test('pagination exposes unknown completeness and never emits an unusable page above the cap', () => {
  const ctx = {
    requestId: 'test',
    operation: 'list_orders' as const,
    signal: new AbortController().signal,
    deadlineAt: 100,
  };
  assert.equal(
    pageResult({ data: [], total: null, totalPages: null }, { page: 1, per_page: 10 }, ctx, 0)
      .pagination.hasMore,
    null,
  );
  const capped = pageResult(
    { data: [], total: 10001, totalPages: 10001 },
    { page: 10000, per_page: 1 },
    ctx,
    0,
  );
  assert.equal(capped.pagination.nextPage, null);
  assert.equal(capped.pagination.hasMore, true);
});
