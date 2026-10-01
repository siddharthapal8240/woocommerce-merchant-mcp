import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Readable, Writable } from 'node:stream';

// The peer is a trusted local MCP host, but stalled/malformed hosts still get finite buffers.
export class BoundedStdioTransport extends StdioServerTransport {
  constructor(
    input: Readable = process.stdin,
    private output: Writable = process.stdout,
    private maxOutputBytes = 4 * 1024 * 1024,
  ) {
    super(input, output, { maxBufferSize: 64 * 1024 });
  }
  override async send(message: JSONRPCMessage): Promise<void> {
    const line = JSON.stringify(message) + '\n';
    if (this.output.writableLength + Buffer.byteLength(line) > this.maxOutputBytes) {
      const error = new Error('MCP output capacity exceeded; closing stalled connection.');
      this.onerror?.(error);
      await this.close();
      throw error;
    }
    await new Promise<void>((resolve, reject) =>
      this.output.write(line, (error) =>
        error ? reject(new Error('MCP output unavailable.')) : resolve(),
      ),
    );
  }
}
