import { Agent } from 'undici';
import type { Config } from '../config.js';
import { ConnectorError, cancellation } from '../contracts/errors.js';
import type { Clock } from '../reliability/clock.js';
import type { RequestContext, StoreScheduler } from '../reliability/scheduler.js';
import type { Telemetry } from '../observability/telemetry.js';
export interface HttpTransport {
  fetch: typeof fetch;
  close(): Promise<void>;
}
export function ownedTransport(connections: number): HttpTransport {
  const agent = new Agent({ connections, pipelining: 1, connect: { timeout: 10_000 } });
  return {
    fetch: (url, init) => {
      const options = { ...init, dispatcher: agent };
      return fetch(url, options);
    },
    close: () => agent.destroy(),
  };
}
export function retryAfter(value: string | null, wallNow: number): number | undefined {
  if (value === null) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.min(Number.MAX_SAFE_INTEGER, Number(value) * 1000);
  if (!/^[A-Za-z]{3},.*GMT$/.test(value)) return undefined;
  const ms = Date.parse(value) - wallNow;
  return Number.isFinite(ms) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, ms)) : undefined;
}
export interface UpstreamResult {
  data: unknown;
  total: number | null;
  totalPages: number | null;
}
export function createHttp(
  config: Config,
  transport: HttpTransport,
  scheduler: StoreScheduler,
  clock: Clock,
  telemetry: Telemetry,
  random = Math.random,
) {
  async function get(
    path: string,
    query: Record<string, string | number | undefined>,
    fields: string,
    ctx: RequestContext,
  ): Promise<UpstreamResult> {
    if (!/^(orders(\/\d+)?|products(\/\d+(\/variations(\/\d+)?)?)?)$/.test(path))
      throw new ConnectorError('INVALID_PATH');
    const url = new URL(path, config.storeUrl);
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) url.searchParams.set(key, String(value));
    url.searchParams.set('_fields', fields);
    for (let attempt = 1; attempt <= config.limits.maxAttempts; attempt++) {
      await scheduler.beforeAttempt(ctx);
      const started = clock.now();
      let status: number | undefined;
      let code: ConnectorError['code'] | undefined;
      let delay: number | undefined;
      let coordinated = false;
      try {
        const response = await transport.fetch(url, {
          method: 'GET',
          redirect: 'error',
          signal: ctx.signal,
          headers: {
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')}`,
          },
        });
        status = response.status;
        if ([429, 502, 503, 504].includes(status)) {
          const hint = retryAfter(response.headers.get('retry-after'), clock.wallNow());
          delay = hint ?? 500 * 2 ** (attempt - 1) + Math.floor(random() * 250);
          coordinated = status === 429 || status === 503 || hint !== undefined;
          // Publish cooldown before freeing the response, so all subsequent starts see it.
          if (coordinated) scheduler.cooldown(delay, ctx);
          await response.body?.cancel();
          if (attempt === config.limits.maxAttempts || delay >= ctx.deadlineAt - clock.now())
            throw new ConnectorError('UPSTREAM_BUSY', Math.ceil(delay));
        } else if (!response.ok) {
          await response.body?.cancel();
          throw new ConnectorError(
            status === 401 || status === 403
              ? 'AUTH_FAILED'
              : status === 404
                ? 'NOT_FOUND'
                : 'UPSTREAM_ERROR',
          );
        } else {
          const data = await readJson(response, config.limits.maxResponseBytes, ctx.signal);
          const header = (name: string) => {
            const value = response.headers.get(name);
            const number = Number(value);
            return value !== null && /^\d+$/.test(value) && Number.isSafeInteger(number)
              ? number
              : null;
          };
          return { data, total: header('x-wp-total'), totalPages: header('x-wp-totalpages') };
        }
      } catch (error) {
        const safe = ctx.signal.aborted
          ? cancellation(ctx.signal)
          : error instanceof ConnectorError
            ? error
            : new ConnectorError('CONNECTION_FAILED');
        code = safe.code;
        throw safe;
      } finally {
        telemetry.emit('attempt', {
          requestId: ctx.requestId,
          operation: ctx.operation,
          attempt,
          status,
          code,
          durationMs: clock.now() - started,
        });
      }
      telemetry.emit('retry', {
        requestId: ctx.requestId,
        operation: ctx.operation,
        attempt,
        delayMs: delay,
      });
      if (!coordinated) await clock.sleep(delay!, ctx.signal);
    }
    throw new ConnectorError('UPSTREAM_BUSY');
  }
  return { get };
}
export type HttpClient = ReturnType<typeof createHttp>;
async function readJson(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ConnectorError('INVALID_RESPONSE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw cancellation(signal);
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ConnectorError('RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new ConnectorError('INVALID_RESPONSE');
    }
  } finally {
    reader.releaseLock();
  }
}
