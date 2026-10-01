import { setTimeout as sleep } from 'node:timers/promises';
import type { Config } from './config.js';

export class ConnectorError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryAfterMs?: number) { super(message); }
}

type Dependencies = {
  fetch: typeof fetch;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
};

export class WooClient {
  private readonly deps: Dependencies;
  constructor(private readonly config: Config, deps: Partial<Dependencies> = {}) {
    this.deps = { fetch, sleep: async (ms, signal) => { await sleep(ms, undefined, { signal }); }, random: Math.random, ...deps };
  }

  async get(path: string, query: Record<string, string | number | undefined> = {}, signal?: AbortSignal) {
    if (!/^(orders|products)(\/\d+)?$/.test(path)) throw new ConnectorError('INVALID_PATH', 'Unsupported endpoint.');
    const url = new URL(path, this.config.storeUrl);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const deadline = AbortSignal.timeout(25_000);
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.deps.fetch(url, {
          method: 'GET', redirect: 'error', signal: requestSignal,
          headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64')}` },
        });
        if ([429, 502, 503, 504].includes(response.status)) {
          const retry = response.headers.get('retry-after');
          const parsed = retry === null ? NaN : /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
          const delay = Number.isFinite(parsed) ? Math.max(0, parsed) : 500 * 2 ** attempt + this.deps.random() * 250;
          await response.body?.cancel();
          if (attempt === 2 || delay > 5_000) throw new ConnectorError('UPSTREAM_BUSY', 'Store is busy. Retry later.', Math.ceil(delay));
          await this.deps.sleep(delay, requestSignal);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          if ([401, 403].includes(response.status)) throw new ConnectorError('AUTH_FAILED', 'Check the store URL, API credentials, and read permissions.');
          if (response.status === 404) throw new ConnectorError('NOT_FOUND', 'Record or WooCommerce endpoint not found.');
          throw new ConnectorError('UPSTREAM_ERROR', `Store rejected the request (HTTP ${response.status}).`);
        }
        let data: unknown;
        try { data = await response.json(); }
        catch { throw new ConnectorError('INVALID_RESPONSE', 'Store returned an invalid JSON response.'); }
        const integerHeader = (name: string) => {
          const raw = response.headers.get(name);
          return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
        };
        return { data, total: integerHeader('x-wp-total'), totalPages: integerHeader('x-wp-totalpages') };
      } catch (error) {
        if (error instanceof ConnectorError) throw error;
        if (requestSignal.aborted) throw new ConnectorError('CANCELLED_OR_TIMEOUT', 'Request cancelled or exceeded its 25-second deadline.');
        // Never expose fetch errors: they can contain URLs or upstream response details.
        throw new ConnectorError('CONNECTION_FAILED', 'Unable to reach the store. Check its URL, TLS, and availability.');
      }
    }
    throw new ConnectorError('UPSTREAM_BUSY', 'Store is busy. Retry later.');
  }
}
