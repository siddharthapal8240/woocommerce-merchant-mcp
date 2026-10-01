import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { BoundedStdioTransport } from '../../src/transport/stdio.js';

const env = {
  ...process.env,
  WC_STORE_URL: 'https://unused.example',
  WC_CONSUMER_KEY: 'test-key',
  WC_CONSUMER_SECRET: 'test-secret',
};
for (const action of ['eof', 'SIGTERM'] as const) {
  test(
    `compiled process keeps stdout JSON-RPC-only and shuts down on ${action}`,
    { timeout: 5000 },
    async () => {
      const child = spawn(process.execPath, ['dist/src/index.js'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      const exited = once(child, 'exit');
      try {
        const firstResponse = once(child.stdout, 'data');
        child.stdin.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-11-25',
              capabilities: {},
              clientInfo: { name: 'lifecycle-test', version: '1.0' },
            },
          }) + '\n',
        );
        await firstResponse;
        if (action === 'eof') child.stdin.end();
        else child.kill(action);
        const [code] = await exited;
        assert.equal(code, 0);
        for (const line of stdout.trim().split('\n')) assert.equal(JSON.parse(line).jsonrpc, '2.0');
        const logs = stderr
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { event: string });
        assert.ok(logs.some((event) => event.event === 'shutdown'));
        assert.ok(!stderr.includes('test-secret'));
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    },
  );
}
test('stdio input cap closes an oversized frame before parsing', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const transport = new BoundedStdioTransport(input, output);
  let closed = false;
  transport.onclose = () => {
    closed = true;
  };
  transport.onerror = () => {};
  await transport.start();
  input.write('x'.repeat(65537));
  await Promise.resolve();
  assert.equal(closed, true);
  await transport.close();
  input.destroy();
  output.destroy();
});
test('stalled stdout has a bounded write buffer and closes on overload', async () => {
  const input = new PassThrough();
  let release: (() => void) | undefined;
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      release = callback;
    },
  });
  const transport = new BoundedStdioTransport(input, output, 100);
  transport.onerror = () => {};
  const first = transport.send({ jsonrpc: '2.0', id: 1, result: {} });
  await assert.rejects(
    transport.send({ jsonrpc: '2.0', id: 2, result: { value: 'x'.repeat(100) } }),
    /capacity/,
  );
  assert.ok(output.writableLength <= 100);
  release?.();
  await first;
  await transport.close();
  input.destroy();
  output.destroy();
});
