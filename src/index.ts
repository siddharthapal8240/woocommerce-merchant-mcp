import { readConfig } from './config.js';
import { createConnector } from './bootstrap.js';
import { stderrSink } from './observability/telemetry.js';
import { BoundedStdioTransport } from './transport/stdio.js';

try {
  const config = readConfig();
  const runtime = createConnector(config, { sink: stderrSink() });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    // Last-resort process deadline if a broken peer/OS connection never completes closure.
    const force = setTimeout(() => process.exit(1), config.limits.shutdownMs + 100).unref();
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    process.stdin.off('end', shutdown);
    try {
      await runtime.close();
      clearTimeout(force);
    } catch {
      process.exitCode = 1;
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  process.stdin.once('end', shutdown);
  runtime.server.server.onclose = () => {
    void shutdown();
  };
  runtime.server.server.onerror = () => runtime.telemetry.emit('transport_error');
  try {
    await runtime.server.connect(new BoundedStdioTransport());
  } catch {
    await shutdown();
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    JSON.stringify({
      event: 'startup_failed',
      code: 'INVALID_CONFIG',
      message: 'Check trusted store credentials, HTTPS URL and reliability configuration.',
    }) + '\n',
  );
  process.exitCode = 1;
}
