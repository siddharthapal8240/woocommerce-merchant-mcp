import { createHash } from 'node:crypto';
import { z } from 'zod';

const limitsSchema = z.object({
  concurrency: z.number().int().min(1).max(16).default(4),
  queueCapacity: z.number().int().min(0).max(128).default(16),
  startsPerSecond: z.number().int().min(1).max(50).default(5),
  deadlineMs: z.number().int().min(100).max(60_000).default(25_000),
  maxAttempts: z.number().int().min(1).max(3).default(3),
  maxResponseBytes: z.number().int().min(1024).max(1_048_576).default(1_048_576),
  shutdownMs: z.number().int().min(100).max(10_000).default(5000),
});
export type Limits = z.infer<typeof limitsSchema>;
export const defaultLimits = limitsSchema.parse({});
export interface Config {
  storeUrl: URL;
  storeRef: string;
  consumerKey: string;
  consumerSecret: string;
  limits: Limits;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value || value.startsWith('replace_with_')) throw new Error(`Configure ${name}.`);
    return value;
  };
  let storeUrl: URL;
  try {
    storeUrl = new URL(required('WC_STORE_URL'));
  } catch {
    throw new Error('WC_STORE_URL must be a valid store root URL.');
  }
  if (storeUrl.protocol !== 'https:')
    throw new Error('WooCommerce API-key authentication requires HTTPS.');
  if (storeUrl.username || storeUrl.password || storeUrl.search || storeUrl.hash)
    throw new Error('Store URL must not include credentials, query parameters, or fragments.');
  if (storeUrl.pathname.includes('/wp-json'))
    throw new Error('Configure the store root, not a REST endpoint.');
  storeUrl.pathname = `${storeUrl.pathname.replace(/\/+$/, '')}/wp-json/wc/v3/`;
  const names: Record<keyof Limits, string> = {
    concurrency: 'WC_MAX_CONCURRENCY',
    queueCapacity: 'WC_QUEUE_CAPACITY',
    startsPerSecond: 'WC_STARTS_PER_SECOND',
    deadlineMs: 'WC_DEADLINE_MS',
    maxAttempts: 'WC_MAX_ATTEMPTS',
    maxResponseBytes: 'WC_MAX_RESPONSE_BYTES',
    shutdownMs: 'WC_SHUTDOWN_MS',
  };
  const raw = Object.fromEntries(
    Object.entries(names).map(([key, name]) => [
      key,
      env[name] === undefined ? undefined : Number(env[name]),
    ]),
  );
  const parsed = limitsSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('Invalid reliability configuration; see documented numeric limits.');
  return {
    storeUrl,
    storeRef: createHash('sha256').update(storeUrl.href).digest('hex').slice(0, 12),
    consumerKey: required('WC_CONSUMER_KEY'),
    consumerSecret: required('WC_CONSUMER_SECRET'),
    limits: parsed.data,
  };
}
