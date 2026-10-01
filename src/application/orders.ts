import type { MerchantReader } from '../infrastructure/woocommerce/adapter.js';
import type { Inputs } from '../contracts/inputs.js';
import type { StoreScheduler } from '../reliability/scheduler.js';
import type { Clock } from '../reliability/clock.js';
import { recordResult, pageResult } from './results.js';
export function createOrderService(
  reader: Pick<MerchantReader, 'listOrders' | 'getOrder'>,
  scheduler: StoreScheduler,
  clock: Clock,
) {
  return {
    list: (args: Inputs['list_orders'], signal?: AbortSignal) =>
      scheduler.run('list_orders', signal, async (ctx) =>
        pageResult(await reader.listOrders(args, ctx), args, ctx, clock.wallNow()),
      ),
    search: (args: Inputs['search_orders'], signal?: AbortSignal) =>
      scheduler.run('search_orders', signal, async (ctx) =>
        pageResult(await reader.listOrders(args, ctx), args, ctx, clock.wallNow()),
      ),
    get: (args: Inputs['get_order'], signal?: AbortSignal) =>
      scheduler.run('get_order', signal, async (ctx) =>
        recordResult(await reader.getOrder(args.id, ctx), ctx, clock.wallNow()),
      ),
  };
}
