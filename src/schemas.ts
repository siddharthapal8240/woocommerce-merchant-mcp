import { z } from 'zod';

// Zod objects strip fields outside this allowlist, including billing/contact data and metadata.
export const orderSchema = z.object({
  id: z.number().int(),
  number: z.string(),
  status: z.string(),
  currency: z.string(),
  total: z.string(),
  date_created: z.string().nullable(),
  line_items: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      product_id: z.number().int(),
      variation_id: z.number().int(),
      quantity: z.number(),
      total: z.string(),
    }),
  ),
});
export const productSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.string(),
  sku: z.string(),
  status: z.string(),
  price: z.string(),
  manage_stock: z.boolean(),
  stock_quantity: z.number().nullable(),
  stock_status: z.string(),
  variations: z.array(z.number().int()),
});
export const pagination = {
  page: z.number().int().min(1).max(10000).default(1),
  per_page: z.number().int().min(1).max(50).default(10),
};
export const orderStatus = z.enum([
  'pending',
  'processing',
  'on-hold',
  'completed',
  'cancelled',
  'refunded',
  'failed',
]);

export const variationSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  status: z.string(),
  price: z.string(),
  manage_stock: z.union([z.boolean(), z.literal('parent')]),
  stock_quantity: z.number().nullable(),
  stock_status: z.string(),
  attributes: z.array(z.object({ name: z.string(), option: z.string() })),
});
