import { format } from 'prettier';
import { writeFile, mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createConnector } from '../src/bootstrap.js';
import { readConfig } from '../src/config.js';

const runtime = createConnector(
  readConfig({
    WC_STORE_URL: 'https://example.test',
    WC_CONSUMER_KEY: 'unused',
    WC_CONSUMER_SECRET: 'unused',
  }),
  {
    transport: {
      fetch: async () => {
        throw new Error('Schema export must not access a store.');
      },
      close: async () => {},
    },
  },
);
const { server } = runtime;
const client = new Client({ name: 'schema-export', version: '1.0.0' });
const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(b);
await client.connect(a);
try {
  await mkdir('docs', { recursive: true });
  await writeFile(
    'docs/mcp-tools.json',
    await format(JSON.stringify(await client.listTools()), { parser: 'json', printWidth: 100 }),
  );
  console.log(
    'Exported authoritative tool specifications to docs/mcp-tools.json. No store access required.',
  );
} finally {
  await client.close();
  await runtime.close();
}
