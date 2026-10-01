import type { Config } from './config.js';
import { createTelemetry, type LogSink } from './observability/telemetry.js';
import { systemClock, type Clock } from './reliability/clock.js';
import { StoreScheduler } from './reliability/scheduler.js';
import { createHttp, ownedTransport, type HttpTransport } from './infrastructure/http.js';
import { createWooCommerceAdapter } from './infrastructure/woocommerce/adapter.js';
import { createOrderService } from './application/orders.js';
import { createInventoryService } from './application/inventory.js';
import { createMcpServer } from './transport/mcp.js';

export function createConnector(
  config: Config,
  dependencies: {
    clock?: Clock;
    transport?: HttpTransport;
    sink?: LogSink;
    random?: () => number;
  } = {},
) {
  const clock = dependencies.clock ?? systemClock;
  const telemetry = createTelemetry(config.storeRef, dependencies.sink, () => clock.wallNow());
  const scheduler = new StoreScheduler(config.limits, clock, telemetry);
  const transport = dependencies.transport ?? ownedTransport(config.limits.concurrency);
  const http = createHttp(config, transport, scheduler, clock, telemetry, dependencies.random);
  const reader = createWooCommerceAdapter(http);
  const orders = createOrderService(reader, scheduler, clock);
  const inventory = createInventoryService(reader, scheduler, clock);
  const diagnostics = () => ({
    scope: 'single-store, process-local',
    limits: config.limits,
    metrics: telemetry.snapshot(),
  });
  const server = createMcpServer(orders, inventory, diagnostics);
  let closing: Promise<void> | undefined;
  function close(): Promise<void> {
    if (closing) return closing;
    closing = (async () => {
      let cancelTimeout = () => {};
      const timeout = new Promise<never>((_resolve, reject) => {
        cancelTimeout = clock.timer(config.limits.shutdownMs, () =>
          reject(new Error('Shutdown deadline exceeded.')),
        );
      });
      try {
        const idle = scheduler.shutdown();
        await Promise.race([Promise.all([idle, transport.close(), server.close()]), timeout]);
        telemetry.emit('shutdown');
      } finally {
        cancelTimeout();
        telemetry.close();
      }
    })();
    return closing;
  }
  return { server, orders, inventory, diagnostics, telemetry, close };
}
