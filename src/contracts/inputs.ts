import { z } from 'zod';
import { pagination, orderStatus } from './records.js';
export const inputs = {
  list_orders: z.object({ ...pagination, status: orderStatus.optional() }).strict(),
  search_orders: z.object({ ...pagination, search: z.string().trim().min(1).max(200) }).strict(),
  get_order: z.object({ id: z.number().int().positive() }).strict(),
  list_products: z
    .object({
      ...pagination,
      stock_status: z.enum(['instock', 'outofstock', 'onbackorder']).optional(),
    })
    .strict(),
  search_products: z
    .object({
      ...pagination,
      search: z.string().trim().min(1).max(200).optional(),
      sku: z.string().trim().min(1).max(100).optional(),
    })
    .strict()
    .refine((v) => v.search || v.sku, 'Provide search or sku.'),
  get_product: z.object({ id: z.number().int().positive() }).strict(),
  list_product_variations: z
    .object({ product_id: z.number().int().positive(), ...pagination })
    .strict(),
  get_product_variation: z
    .object({ product_id: z.number().int().positive(), variation_id: z.number().int().positive() })
    .strict(),
};
export type Inputs = { [K in keyof typeof inputs]: z.infer<(typeof inputs)[K]> };
