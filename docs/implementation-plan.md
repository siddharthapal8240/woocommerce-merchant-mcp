# Implementation and verification plan

## Outcome

Deliver Assignment 3: a private WooCommerce connector exposing authenticated, read-only order and inventory access to an MCP-compatible agent. All custom application, setup, seed, demo, and test code is TypeScript. Use fictional merchant data only.

## Repository and working method

- Repository: `woocommerce-merchant-mcp` (GitHub, initially private).
- Implementation branch: `feat/woocommerce-connector`; no `codex/` branches.
- Commit coherent milestones after checking them. Push the finished source and evidence.
- Record actual results separately from planned acceptance criteria. Never call a mocked integration a real-store demonstration.

## Phase 1 — Foundation

Implemented: strict TypeScript, Node.js, Zod, MCP SDK, GET-only API client, eight order/product/variation tools, environment configuration, safe errors, pagination and retries.

Acceptance: typecheck, unit tests, MCP transport tests, and build pass. Test URL validation, secret handling, bounded retries, invalid arguments and response minimization.

## Phase 2 — Reproducible real store

Prepare a Docker-based WordPress/WooCommerce test store. Automate installation and fictional fixtures using TypeScript orchestration and official WP-CLI/API interfaces. Keep credentials in ignored local files. Separate seed/write credentials from the connector's read-only credentials.

Acceptance: a clean bootstrap produces products and orders; repeated setup avoids duplicates; valid read-only credentials retrieve records; invalid credentials fail; read-only credentials cannot mutate records. Document exact dependency versions and local resource requirements.

## Phase 3 — Connector hardening

Exercise all tools against actual WooCommerce. Add any missing primitives needed by the demonstration, particularly variant stock when relevant. Validate upstream response shapes, pagination, cancellation, timeouts and rate limiting. Keep output bounded and customer information minimized.

Acceptance: unit and MCP integration suites pass; live tests prove list/get/search, inventory accuracy, pagination, missing records, auth failures, field minimization and denied writes. Synthetic fault tests verify 429/503 behavior without overloading a real store.

## Phase 4 — Demonstration and agent integration

Build a TypeScript MCP client demo that discovers tools, retrieves processing orders, follows product references, and reports stock using actual results. Export the MCP tool specification. Provide a ready-to-use client configuration and merchant prompts for an LLM agent. Keep deterministic tool workflows explicitly distinguished from model-driven agent runs.

Acceptance: demo runs from documented commands and produces reproducible, secret-free evidence from a real store. Verify local MCP connectivity end to end through stdio. Agent Studio integration is not claimed without access; the assignment permits an MCP specification or equivalent.

## Phase 5 — Submission package

Finish README, setup/run instructions, architecture and tradeoffs, capabilities/limitations, test evidence and a concise demo walkthrough. Add CI. Review tracked files for secrets, private data and accidental artifacts. Create and push the dedicated GitHub repository.

Acceptance: `npm ci` and documented checks pass; live evidence exists; setup is reproducible; repository is pushed; README states any residual integration limitations. Private repository access must be granted to the hiring team or visibility changed before submission.

## Testing layers

| Layer                  | Purpose                                                     | Evidence                   |
| ---------------------- | ----------------------------------------------------------- | -------------------------- |
| Static                 | Strict types and compilation                                | typecheck/build            |
| Unit/fault             | Configuration, transport errors, bounded retries, deadlines | Node test runner           |
| MCP integration        | Discovery, schemas, tool execution, safe failures           | SDK client over transports |
| Real-store integration | Native WooCommerce API and auth semantics                   | seeded Docker store        |
| End-to-end             | Spawn compiled server, discover and invoke tools            | stdio demo report          |
| Submission             | Secret checks, documentation accuracy, clean Git state      | final verification         |

## Completion record

- Phase 1: complete. Strict types, formatting, build and 15 unit/protocol/fault tests passed.
- Phase 2: complete. Real WooCommerce 10.2.2 store runs over verified local HTTPS; restricted credentials and repeatable fictional seed verified.
- Phase 3: complete. Live tests passed for all eight tools, native auth, denied writes, pagination, search, variants, missing records and null stock.
- Phase 4: complete for the MCP-specification route. Compiled stdio demo and exported tool specification are checked in; model-host prompts/configuration are supplied. Direct Agent Studio access remains unavailable and is not claimed.
- Phase 5: complete. Documentation, fictional evidence and implementation are committed and pushed. Fresh GitHub CI passed both static/unit and real-store jobs: https://github.com/siddharthapal8240/woocommerce-merchant-mcp/actions/runs/36917430511. The dedicated repository is private; grant reviewer access before submitting its link.

# Production-minded reassessment (2 October 2026)

Branch: `refactor/connector-reliability`. Existing `main` and its working store/evidence are preserved. The three existing Docker services are healthy; no connector or duplicate setup process was running at review time.

## Concrete gaps and priority

1. **P1 capacity:** every MCP call independently starts HTTP work. There is no active-work bound, bounded admission queue, start-rate control, or shared Retry-After cooldown. Deadlines begin inside HTTP, not at admission. Prove these bounds before making performance claims.
2. **P1 lifecycle:** no explicit shutdown lifecycle or ownership of outbound connections. Cancellation is partly supported but queue/timer cleanup cannot yet be tested because no scheduler exists.
3. **P1 boundaries:** `server.ts` mixes MCP registration, upstream shape validation, pagination and error handling. The demo owns inventory interpretation. Separate transport, application operations, adapter mappings and shared contracts without adding services.
4. **P2 observability:** no correlation IDs, structured operational events or bounded aggregate counters. Introduce allowlisted fields, stderr-only logs and backpressure-aware logging.
5. **P2 proof/documentation:** tests prove sequential behavior but not overlapping load, fairness, coordinated retry or lifecycle cleanup. Existing CI/live evidence remains valid for the prototype, not for the new controls.

## New delivery phases and acceptance

| Phase                         | Work                                                                                                                                                 | Acceptance / evidence                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A — Review and decisions      | Baseline tests, process/Git inspection, architecture and ADRs                                                                                        | Baseline unchanged; prioritized gaps and explicit single-store scope recorded                                      |
| B — Boundaries                | Shared contracts; explicit Woo mappings; order/inventory services; thin MCP handlers; composition root                                               | Existing tool names/results preserved; mapping and domain tests; no runtime import of setup/demo code              |
| C — Reliability and lifecycle | Bounded admission and concurrency; process-local per-store pacing/cooldown; whole-operation deadline; cancellable retries; owned HTTP pool; shutdown | Deterministic tests prove queue/in-flight bounds, overload, cancellation, deadlines, shared cooldown and cleanup   |
| D — Observability             | Correlated allowlisted JSON events, bounded counters/high-water gauges, stderr backpressure                                                          | No credential/query/record data in logs; stdout protocol remains clean; usable local inspection command            |
| E — Evidence and handoff      | Synthetic load report, live store tests, compiled demo, schema export, docs, CI, secret review                                                       | Measured conditions/results recorded; live and synthetic claims separate; clean pushed repository and inspected CI |

No cache or circuit breaker is planned: stock freshness matters and there is no evidence that either is necessary. Admission limits, pacing, cooldown and finite retries directly address the observed risks. These controls are process-local; replicas would require coordinated store quotas and authenticated tenant ownership, neither of which is claimed.

## Reassessment completion evidence

- A: complete. Clean Git baseline, existing process/store inspection and the original 15 checks recorded before changes. Review and ADRs committed as 71631b6.
- B: implemented and locally verified. Eight MCP tool names and record contracts preserved; thin handlers, domain services and explicit mappings tested independently.
- C: implemented and locally verified. Deterministic admission/cooldown/deadline/cancellation tests pass, including a fixed same-deadline dispatch race. The 100-call synthetic experiment measured 4 maximum in-flight, 16 maximum queued, 20 successes, 80 overloads and zero pending timers.
- D: implemented and locally verified. Correlated allowlisted logs, bounded counters, diagnostics resource, slow-stderr handling and a real-demo log inspection passed. No new monitoring service was added.
- E: local evidence complete: 30 unit/integration/reliability/lifecycle tests, strict compilation, the real WooCommerce suite and compiled demo passed. Focused candidate-file and Git-history secret checks passed. Updated schema, configuration, failure modes, operations, limitations and submission mapping are included. **New GitHub CI verification is pending after push; reassessment is not yet marked complete.**
