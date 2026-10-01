import type { Writable } from 'node:stream';
import type { ErrorCode } from '../contracts/errors.js';
export type Operation =
  | 'list_orders'
  | 'search_orders'
  | 'get_order'
  | 'list_products'
  | 'search_products'
  | 'get_product'
  | 'list_product_variations'
  | 'get_product_variation';
export type EventName =
  | 'admitted'
  | 'started'
  | 'completed'
  | 'rejected'
  | 'attempt'
  | 'retry'
  | 'throttle'
  | 'shutdown'
  | 'transport_error';
export interface EventFields {
  requestId?: string;
  operation?: Operation;
  code?: ErrorCode;
  durationMs?: number;
  queueWaitMs?: number;
  status?: number;
  attempt?: number;
  delayMs?: number;
}
export interface LogSink {
  write(line: string): void;
  dropped(): number;
  close(): void;
}
export function stderrSink(stream: Writable = process.stderr): LogSink {
  let blocked = false;
  let dropped = 0;
  let closed = false;
  const drain = () => {
    blocked = false;
  };
  const error = () => {
    blocked = true;
  };
  stream.on('drain', drain);
  stream.on('error', error);
  return {
    write(line) {
      if (closed || blocked) {
        dropped++;
        return;
      }
      try {
        blocked = !stream.write(line);
      } catch {
        blocked = true;
        dropped++;
      }
    },
    dropped: () => dropped,
    close() {
      closed = true;
      stream.off('drain', drain);
      stream.off('error', error);
    },
  };
}
export function createTelemetry(storeRef: string, sink?: LogSink, wallNow = Date.now) {
  const state = {
    admitted: 0,
    completed: 0,
    failed: 0,
    rejected: 0,
    attempts: 0,
    upstreamFailures: 0,
    retries: 0,
    throttles: 0,
    active: 0,
    queued: 0,
    maxActive: 0,
    maxQueued: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    totalQueueWaitMs: 0,
  };
  const failures: Partial<Record<ErrorCode, number>> = {};
  function gauges(active: number, queued: number) {
    state.active = active;
    state.queued = queued;
    state.maxActive = Math.max(active, state.maxActive);
    state.maxQueued = Math.max(queued, state.maxQueued);
  }
  function emit(event: EventName, fields: EventFields = {}) {
    if (event === 'admitted') state.admitted++;
    if (event === 'completed') {
      state.completed++;
      if (fields.code) state.failed++;
      state.totalDurationMs += fields.durationMs ?? 0;
      state.maxDurationMs = Math.max(state.maxDurationMs, fields.durationMs ?? 0);
    }
    if (event === 'rejected') state.rejected++;
    if ((event === 'completed' || event === 'rejected') && fields.code)
      failures[fields.code] = (failures[fields.code] ?? 0) + 1;
    if (event === 'started') state.totalQueueWaitMs += fields.queueWaitMs ?? 0;
    if (event === 'attempt') {
      state.attempts++;
      if (
        (fields.status ?? 0) >= 400 ||
        (fields.code &&
          ['CONNECTION_FAILED', 'INVALID_RESPONSE', 'RESPONSE_TOO_LARGE'].includes(fields.code))
      )
        state.upstreamFailures++;
    }
    if (event === 'retry') state.retries++;
    if (event === 'throttle') state.throttles++;
    // Explicit allowlist, even if an untyped caller supplies extra properties.
    sink?.write(
      JSON.stringify({
        timestamp: new Date(wallNow()).toISOString(),
        event,
        storeRef,
        ...(event === 'shutdown'
          ? { metrics: { ...state, failures: { ...failures }, droppedLogs: sink?.dropped() ?? 0 } }
          : {}),
        requestId: fields.requestId,
        operation: fields.operation,
        code: fields.code,
        durationMs: fields.durationMs,
        queueWaitMs: fields.queueWaitMs,
        status: fields.status,
        attempt: fields.attempt,
        delayMs: fields.delayMs,
        active: state.active,
        queued: state.queued,
      }) + '\n',
    );
  }
  return {
    gauges,
    emit,
    snapshot: () => ({ ...state, failures: { ...failures }, droppedLogs: sink?.dropped() ?? 0 }),
    close: () => sink?.close(),
  };
}
export type Telemetry = ReturnType<typeof createTelemetry>;
