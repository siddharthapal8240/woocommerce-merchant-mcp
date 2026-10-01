# ADR 002 — Bounded process-local work, no cache or circuit breaker

Status: accepted, 2 October 2026.

Default limits: four admitted active operations, sixteen queued operations, five upstream starts per second, three total attempts and a 25-second whole-operation deadline. Configuration has explicit finite upper bounds. Each active operation retains its slot while waiting/retrying; the queue is FIFO. This trades peak throughput for a simple provable memory/work bound and avoids retry storms.

All calls share one process-local store cooldown. Retry-After from 429/503 affects subsequent upstream attempts, including unrelated calls. Calls already in flight cannot be recalled. Retry waits, queueing, pacing, response reading and mapping share the admission deadline. Long cooldowns are returned as safe actionable errors when they cannot fit the remaining budget.

Shutdown stops admissions and cancels queued/active reads, then closes transport and owned outbound connections within a bounded grace period. Reads have no partial writes to finish.

Do not add caching: current stock correctness is more useful than speculative latency gains. Do not add a circuit breaker without measured need: finite admission, pacing, coordinated cooldown and bounded retries address the demonstrated overload modes without modal recovery behavior.

These limits multiply across replicas. Multiple replicas require shared per-store rate coordination or explicit partitioned budgets. No global WooCommerce capacity claim follows from synthetic adapter tests.
