import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export async function connect(envFile = '.local/connector.env') {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [`--env-file=${resolve(envFile)}`, resolve('dist/src/index.js')],
    stderr: 'pipe',
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (item): item is [string, string] => item[1] !== undefined,
        ),
      ),
      ...(existsSync('.local/root.crt') ? { NODE_EXTRA_CA_CERTS: resolve('.local/root.crt') } : {}),
    },
  });
  const client = new Client({ name: 'merchant-demo-client', version: '1.0.0' });
  try {
    await client.connect(transport);
  } catch {
    await transport.close();
    throw new Error(
      'Could not connect to MCP server. Build it and configure the environment file first.',
    );
  }
  return client;
}
