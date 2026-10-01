import type { HttpClient } from '../http.js';
import type { RequestContext } from '../../reliability/scheduler.js';
import type { Inputs } from '../../contracts/inputs.js';
import { mapOrder, mapProduct, mapVariation, mapList } from './mappings.js';

const fields = {
  orders: 'id,number,status,currency,total,date_created,line_items',
  products: 'id,name,type,sku,status,price,manage_stock,stock_quantity,stock_status,variations',
  variations: 'id,sku,status,price,manage_stock,stock_quantity,stock_status,attributes',
};
export function createWooCommerceAdapter(http: HttpClient) {
  return {
    async listOrders(query: Inputs['list_orders'] | Inputs['search_orders'], ctx: RequestContext) {
      const result = await http.get('orders', query, fields.orders, ctx);
      return { ...result, data: mapList(result.data, mapOrder, query.per_page) };
    },
    async getOrder(id: number, ctx: RequestContext) {
      return mapOrder((await http.get(`orders/${id}`, {}, fields.orders, ctx)).data);
    },
    async listProducts(
      query: Inputs['list_products'] | Inputs['search_products'],
      ctx: RequestContext,
    ) {
      const result = await http.get('products', query, fields.products, ctx);
      return { ...result, data: mapList(result.data, mapProduct, query.per_page) };
    },
    async getProduct(id: number, ctx: RequestContext) {
      return mapProduct((await http.get(`products/${id}`, {}, fields.products, ctx)).data);
    },
    async listVariations(query: Inputs['list_product_variations'], ctx: RequestContext) {
      const { product_id, ...page } = query;
      const result = await http.get(
        `products/${product_id}/variations`,
        page,
        fields.variations,
        ctx,
      );
      return { ...result, data: mapList(result.data, mapVariation, page.per_page) };
    },
    async getVariation(query: Inputs['get_product_variation'], ctx: RequestContext) {
      return mapVariation(
        (
          await http.get(
            `products/${query.product_id}/variations/${query.variation_id}`,
            {},
            fields.variations,
            ctx,
          )
        ).data,
      );
    },
  };
}
export type MerchantReader = ReturnType<typeof createWooCommerceAdapter>;
