import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run logs:inspect -- path/to/connector.ndjson');
  process.exitCode = 1;
} else {
  const totals = {
    events: 0,
    completed: 0,
    failures: 0,
    retries: 0,
    throttles: 0,
    rejected: 0,
    maxActive: 0,
    maxQueued: 0,
    meanDurationMs: 0,
    malformed: 0,
  };
  const input = createReadStream(file);
  input.on('error', () => {
    console.error('Cannot read the requested log file.');
    process.exitCode = 1;
  });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      totals.events++;
      if (event.event === 'completed') {
        totals.completed++;
        if (event.code) totals.failures++;
        if (typeof event.durationMs === 'number')
          totals.meanDurationMs += (event.durationMs - totals.meanDurationMs) / totals.completed;
      }
      if (event.event === 'retry') totals.retries++;
      if (event.event === 'throttle') totals.throttles++;
      if (event.event === 'rejected') totals.rejected++;
      if (typeof event.active === 'number')
        totals.maxActive = Math.max(totals.maxActive, event.active);
      if (typeof event.queued === 'number')
        totals.maxQueued = Math.max(totals.maxQueued, event.queued);
    } catch {
      totals.malformed++;
    }
  }
  console.log(JSON.stringify(totals, null, 2));
}
