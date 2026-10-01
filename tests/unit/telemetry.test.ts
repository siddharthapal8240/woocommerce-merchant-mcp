import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createTelemetry, stderrSink } from '../../src/observability/telemetry.js';

test('telemetry uses allowlisted fields and fixed-cardinality counters, excluding unexpected payloads', () => {
  const lines: string[] = [];
  const telemetry = createTelemetry(
    'store-ref',
    {
      write: (line) => {
        lines.push(line);
      },
      dropped: () => 0,
      close: () => {},
    },
    () => 0,
  );
  telemetry.gauges(4, 16);
  telemetry.emit('completed', {
    requestId: 'id',
    operation: 'get_order',
    durationMs: 5,
    code: 'AUTH_FAILED',
    ...{ password: 'test-secret', url: 'private.example', payload: 'customer' },
  });
  assert.ok(!lines.join('').includes('test-secret'));
  assert.ok(!lines.join('').includes('private.example'));
  assert.equal(telemetry.snapshot().maxQueued, 16);
  assert.equal(telemetry.snapshot().failed, 1);
});
test('slow stderr stops log writes and records drops without an application-side queue', () => {
  const callbacks: Array<(error?: Error | null) => void> = [];
  const stream = new Writable({
    highWaterMark: 1,
    write(_chunk, _encoding, callback) {
      callbacks.push(callback);
    },
  });
  const sink = stderrSink(stream);
  sink.write('first\n');
  for (let i = 0; i < 1000; i++) sink.write('blocked\n');
  assert.equal(stream.writableLength, 6);
  assert.equal(sink.dropped(), 1000);
  callbacks[0]!();
  sink.close();
  stream.destroy();
});
