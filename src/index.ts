import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConfig } from './config.js';
import { WooClient } from './client.js';
import { createServer } from './server.js';

try {
  const server = createServer(new WooClient(readConfig()));
  await server.connect(new StdioServerTransport());
} catch {
  console.error(
    'Connector startup failed. Check WC_STORE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET and HTTPS configuration.',
  );
  process.exitCode = 1;
}
