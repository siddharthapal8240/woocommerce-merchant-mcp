import { performance } from 'node:perf_hooks';
import { cancellation } from '../contracts/errors.js';
export interface Clock {
  now(): number;
  wallNow(): number;
  timer(ms: number, callback: () => void): () => void;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
export const systemClock: Clock = {
  now: () => performance.now(),
  wallNow: () => Date.now(),
  timer(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
  sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(cancellation(signal));
        return;
      }
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(cancellation(signal));
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      signal.addEventListener('abort', abort, { once: true });
    });
  },
};
