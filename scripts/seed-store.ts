import { mkdir, writeFile } from 'node:fs/promises';
import { localApi, json } from './local.js';

type RecordId = { id: number };
const products = [
  {
    name: 'Blue Everyday T-shirt',
    sku: 'DEMO-BLUE-TEE',
    regular_price: '599.00',
    stock_quantity: 12,
  },
  { name: 'Canvas Tote Bag', sku: 'DEMO-TOTE', regular_price: '349.00', stock_quantity: 0 },
  { name: 'Ceramic Coffee Mug', sku: 'DEMO-MUG', regular_price: '449.00', stock_quantity: 7 },
  { name: 'Gift Wrapping', sku: 'DEMO-WRAP', regular_price: '49.00', manage_stock: false },
];
async function request<T>(path: string, body?: unknown): Promise<T> {
  return json<T>(
    await localApi(path, body ? { method: 'POST', body: JSON.stringify(body) } : {}, true),
  );
}
async function main() {
  const ids: Record<string, number> = {};
  for (const product of products) {
    const existing = await request<RecordId[]>(`products?sku=${product.sku}`);
    const record =
      existing[0] ??
      (await request<RecordId>('products', {
        type: 'simple',
        status: 'publish',
        manage_stock: true,
        ...product,
      }));
    ids[product.sku] = record.id;
  }
  const parent =
    (await request<RecordId[]>('products?sku=DEMO-HOODIE'))[0] ??
    (await request<RecordId>('products', {
      name: 'Everyday Hoodie',
      sku: 'DEMO-HOODIE',
      type: 'variable',
      status: 'publish',
      attributes: [{ name: 'Size', visible: true, variation: true, options: ['M', 'L'] }],
    }));
  ids['DEMO-HOODIE'] = parent.id;
  for (const [size, stock] of [
    ['M', 5],
    ['L', 0],
  ] as const) {
    const sku = `DEMO-HOODIE-${size}`;
    const existing = await request<Array<RecordId & { sku: string }>>(
      `products/${parent.id}/variations`,
    );
    const variation =
      existing.find((item) => item.sku === sku) ??
      (await request<RecordId>(`products/${parent.id}/variations`, {
        sku,
        regular_price: '1299.00',
        manage_stock: true,
        stock_quantity: stock,
        attributes: [{ name: 'Size', option: size }],
      }));
    ids[sku] = variation.id;
  }
  const existingOrders: Array<
    RecordId & { created_via: string; meta_data: Array<{ key: string; value: string }> }
  > = [];
  for (let page = 1; ; page++) {
    const batch = await request<typeof existingOrders>(`orders?per_page=100&page=${page}`);
    existingOrders.push(...batch);
    if (batch.length < 100) break;
  }
  const fixtures = [
    {
      ref: 'demo-ready',
      status: 'processing',
      items: [{ product_id: ids['DEMO-BLUE-TEE'], quantity: 2 }],
    },
    {
      ref: 'demo-stockout',
      status: 'processing',
      items: [
        { product_id: ids['DEMO-TOTE'], quantity: 1 },
        { product_id: ids['DEMO-MUG'], quantity: 1 },
      ],
    },
    {
      ref: 'demo-variant',
      status: 'on-hold',
      items: [{ product_id: parent.id, variation_id: ids['DEMO-HOODIE-L'], quantity: 1 }],
    },
    {
      ref: 'demo-completed',
      status: 'completed',
      items: [{ product_id: ids['DEMO-MUG'], quantity: 1 }],
    },
  ];
  const orderIds: Record<string, number> = {};
  for (const fixture of fixtures) {
    const existing = existingOrders.find(
      (item) =>
        item.created_via === 'merchant-mcp-fixture' &&
        item.meta_data.some((meta) => meta.key === '_demo_reference' && meta.value === fixture.ref),
    );
    const order =
      existing ??
      (await request<RecordId>('orders', {
        status: fixture.status,
        created_via: 'merchant-mcp-fixture',
        currency: 'INR',
        billing: {
          first_name: 'Fictional',
          last_name: fixture.ref,
          email: `${fixture.ref}@example.test`,
        },
        customer_note: 'Fictional fixture; never contact a real customer.',
        line_items: fixture.items,
        meta_data: [{ key: '_demo_reference', value: fixture.ref }],
      }));
    orderIds[fixture.ref] = order.id;
  }
  // Reset fixture stock after order creation, which can reduce inventory in WooCommerce.
  for (const product of products) {
    await json(
      await localApi(
        `products/${ids[product.sku]}`,
        { method: 'PUT', body: JSON.stringify({ manage_stock: true, ...product }) },
        true,
      ),
    );
  }
  for (const [size, stock] of [
    ['M', 5],
    ['L', 0],
  ] as const) {
    await json(
      await localApi(
        `products/${parent.id}/variations/${ids[`DEMO-HOODIE-${size}`]}`,
        { method: 'PUT', body: JSON.stringify({ manage_stock: true, stock_quantity: stock }) },
        true,
      ),
    );
  }
  await mkdir('.local', { recursive: true, mode: 0o700 });
  await writeFile(
    '.local/fixtures.json',
    JSON.stringify({ products: ids, orders: orderIds }, null, 2),
  );
  console.log(
    `Seeded/reused ${products.length + 1} products, 2 variations and ${fixtures.length} fictional orders. No real customer data used.`,
  );
}
main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
