# Verification record

## Current reassessment

2 October 2026 (Asia/Kolkata), branch `refactor/connector-reliability`. The existing real store was reused; setup and seeding were not duplicated. Prior prototype evidence is retained in Git history and must not be confused with the new controls.

Environment: macOS/Apple Silicon, Node.js 24.5.0; the existing two-CPU/four-GiB Colima VM; WordPress 6.8.3, WooCommerce 10.2.2, MariaDB 11.4 and Caddy 2.10.2. Docker image digests and npm lockfile pin dependencies. Native API-key authentication uses verified HTTPS and a project-specific CA.

## Local checks

- Strict compilation and formatting pass; all **30** domain/mapping, adapter, MCP, deterministic reliability and compiled-process lifecycle tests pass.
- Live WooCommerce tests pass for all eight tools, real search/pagination, exact variant stock, null stock, invalid credentials, missing records and rejected writes with the Read key.
- Compiled stdio demo still performs ten actual MCP calls and reports the fictional tote/hoodie stock concerns.
- Logging inspection was exercised against the real demo: ten completed operations, no failures/retries/throttles, maximum active count one and no malformed log records. Request latency includes the configured pacing wait and is not a store-capacity measurement.
- SIGTERM and EOF tests prove the compiled process exits cleanly and stdout contains JSON-RPC only. Input-frame and stalled-output limits are tested separately.
- An observed same-deadline race was fixed: queued work is explicitly checked at dispatch instead of relying solely on the ordering of timer callbacks.

## Deterministic capacity experiment

Source: `tests/support/capacity.ts`; command: `npm run test:capacity`; raw evidence: `evidence/capacity.json`.

**Conditions:** one process, virtual clock, synthetic HTTP adapter, all 100 calls offered before advancing time. Four active operation slots, sixteen queue slots, 50 upstream starts/second (a 20 ms interval), 100 ms injected response delay, 2000 ms total deadline. This deliberately differs from the conservative runtime default of five starts/second.

| Observation                                      | Measured result |
| ------------------------------------------------ | --------------- |
| Offered calls                                    | 100             |
| Completed calls                                  | 20              |
| Explicit overload responses                      | 80              |
| Maximum HTTP calls in flight                     | 4               |
| Maximum queue depth                              | 16              |
| Virtual completion time                          | 560 ms          |
| Outstanding request/wait timers after settlement | 0               |

Separate coordinated-throttling scenario: two overlapping operations, first response 429 with Retry-After one second. Observed upstream start times were **0, 1000 and 1020 ms**. The retry and unrelated call both respected the shared cooldown and start spacing. A corresponding 503 case also passes.

Cancellation scenario: one active and one queued request cancelled; the remaining request completed. Only two HTTP calls started, and request timers and external abort listeners were removed. Additional tests verify FIFO, zero-capacity queues, total deadlines during queueing and response reads, finite retry jitter/exhaustion, long cooldowns affecting later calls, and bounded shutdown even if a transport fails to close.

These are **synthetic control tests**, not WooCommerce load tests. No requests-per-second capacity, production latency SLO, heap/RSS bound or multi-replica scalability claim is inferred.

## Reproduce

```sh
npm ci
npm run check
npm run test:capacity
npm run test:live
MCP_LOG_FILE=.local/connector.ndjson npm run demo
npm run logs:inspect -- .local/connector.ndjson
npm run tools:export
npm run check:secrets -- --history
```

A fresh environment must run store setup/seed first. CI performs that bootstrap on a clean Ubuntu runner and verifies Node.js 22/24 separately. New CI run results will be recorded after pushing this reassessment; earlier successful prototype runs are historical evidence only.

## Explicit limitations

The demo is a scripted MCP workflow, not an actual LLM agent conversation. Direct Agent Studio connectivity remains unverified without account/transport access. Controls and metrics are process-local. Private repository access must be granted to the hiring team before submitting the link.
