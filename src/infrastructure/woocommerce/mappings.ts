import { orderSchema, productSchema, variationSchema } from '../../contracts/records.js';
import { ConnectorError } from '../../contracts/errors.js';
import { z } from 'zod';
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ConnectorError('INVALID_RESPONSE');
  return parsed.data;
}
// Explicit field projections maintain the public contract independently of upstream additions.
export function mapOrder(raw: unknown) {
  const item = validate(orderSchema, raw);
  return {
    id: item.id,
    number: item.number,
    status: item.status,
    currency: item.currency,
    total: item.total,
    date_created: item.date_created,
    line_items: item.line_items.map((line) => ({
      id: line.id,
      name: line.name,
      product_id: line.product_id,
      variation_id: line.variation_id,
      quantity: line.quantity,
      total: line.total,
    })),
  };
}
export function mapProduct(raw: unknown) {
  const item = validate(productSchema, raw);
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    sku: item.sku,
    status: item.status,
    price: item.price,
    manage_stock: item.manage_stock,
    stock_quantity: item.stock_quantity,
    stock_status: item.stock_status,
    variations: item.variations,
  };
}
export function mapVariation(raw: unknown) {
  const item = validate(variationSchema, raw);
  return {
    id: item.id,
    sku: item.sku,
    status: item.status,
    price: item.price,
    manage_stock: item.manage_stock,
    stock_quantity: item.stock_quantity,
    stock_status: item.stock_status,
    attributes: item.attributes.map((attribute) => ({
      name: attribute.name,
      option: attribute.option,
    })),
  };
}
export function mapList<T>(raw: unknown, map: (value: unknown) => T, pageSize: number): T[] {
  if (!Array.isArray(raw) || raw.length > pageSize) throw new ConnectorError('INVALID_RESPONSE');
  return raw.map(map);
}
