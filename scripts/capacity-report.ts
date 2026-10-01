import { mkdir, writeFile } from 'node:fs/promises';
import {
  burstScenario,
  cooldownScenario,
  cancellationScenario,
} from '../tests/support/capacity.js';
const report = {
  measuredAt: new Date().toISOString(),
  conditions:
    'Deterministic virtual clock and synthetic HTTP adapter in one Node process. Not a WooCommerce benchmark or a real-world throughput claim.',
  burst: await burstScenario(),
  cooldown: await cooldownScenario(),
  cancellation: await cancellationScenario(),
};
await mkdir('evidence', { recursive: true });
await writeFile('evidence/capacity.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
