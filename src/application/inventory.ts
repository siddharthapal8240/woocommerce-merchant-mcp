import type { MerchantReader } from '../infrastructure/woocommerce/adapter.js';
import type { Inputs } from '../contracts/inputs.js';
import type { StoreScheduler } from '../reliability/scheduler.js';
import type { Clock } from '../reliability/clock.js';
import { recordResult, pageResult } from './results.js';
export function createInventoryService(
  reader: Pick<MerchantReader, 'listProducts' | 'getProduct' | 'listVariations' | 'getVariation'>,
  scheduler: StoreScheduler,
  clock: Clock,
) {
  return {
    list: (args: Inputs['list_products'], signal?: AbortSignal) =>
      scheduler.run('list_products', signal, async (ctx) =>
        pageResult(await reader.listProducts(args, ctx), args, ctx, clock.wallNow()),
      ),
    search: (args: Inputs['search_products'], signal?: AbortSignal) =>
      scheduler.run('search_products', signal, async (ctx) =>
        pageResult(await reader.listProducts(args, ctx), args, ctx, clock.wallNow()),
      ),
    get: (args: Inputs['get_product'], signal?: AbortSignal) =>
      scheduler.run('get_product', signal, async (ctx) =>
        recordResult(await reader.getProduct(args.id, ctx), ctx, clock.wallNow()),
      ),
    listVariations: (args: Inputs['list_product_variations'], signal?: AbortSignal) =>
      scheduler.run('list_product_variations', signal, async (ctx) =>
        pageResult(await reader.listVariations(args, ctx), args, ctx, clock.wallNow()),
      ),
    getVariation: (args: Inputs['get_product_variation'], signal?: AbortSignal) =>
      scheduler.run('get_product_variation', signal, async (ctx) =>
        recordResult(await reader.getVariation(args, ctx), ctx, clock.wallNow()),
      ),
  };
}
interface Stock {
  manage_stock: boolean | 'parent';
  stock_quantity: number | null;
  stock_status: string;
}
export function assessStock(product: Stock, quantity: number, variation?: Stock) {
  const stock = !variation || variation.manage_stock === 'parent' ? product : variation;
  const verdict =
    stock.stock_status === 'outofstock'
      ? 'OUT OF STOCK'
      : stock.stock_status === 'onbackorder'
        ? 'BACKORDER — merchant review needed'
        : stock.stock_status !== 'instock'
          ? 'UNKNOWN STOCK STATE — merchant review needed'
          : stock.manage_stock === true && stock.stock_quantity !== null
            ? stock.stock_quantity >= quantity
              ? 'CURRENT STOCK SUFFICIENT'
              : 'INSUFFICIENT CURRENT STOCK'
            : 'QUANTITY UNTRACKED — merchant review needed';
  return { verdict, quantity: stock.stock_quantity };
}
