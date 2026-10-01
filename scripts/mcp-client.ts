import type { Readable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { existsSync, createWriteStream } from 'node:fs';

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
  // Drain operational logs so a verbose server cannot block on an unread stderr pipe.
  const stderr = transport.stderr as Readable | null;
  const logs = process.env.MCP_LOG_FILE
    ? createWriteStream(process.env.MCP_LOG_FILE, { flags: 'a', mode: 0o600 })
    : undefined;
  if (logs) {
    logs.on('error', () => {
      stderr?.unpipe(logs);
      stderr?.resume();
      console.error('Could not write connector logs.');
    });
    stderr?.pipe(logs);
  } else stderr?.on('data', () => {});
  const client = new Client({ name: 'merchant-demo-client', version: '1.0.0' });
  client.onclose = () => logs?.end();
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
