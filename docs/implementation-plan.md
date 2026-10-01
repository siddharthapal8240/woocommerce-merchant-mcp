# Implementation and verification plan

## Outcome

Deliver Assignment 3: a private WooCommerce connector exposing authenticated, read-only order and inventory access to an MCP-compatible agent. All custom application, setup, seed, demo, and test code is TypeScript. Use fictional merchant data only.

## Repository and working method

- Repository: `woocommerce-merchant-mcp` (GitHub, initially private).
- Implementation branch: `feat/woocommerce-connector`; no `codex/` branches.
- Commit coherent milestones after checking them. Push the finished source and evidence.
- Record actual results separately from planned acceptance criteria. Never call a mocked integration a real-store demonstration.

## Phase 1 — Foundation

Implemented: strict TypeScript, Node.js, Zod, MCP SDK, GET-only API client, six list/get/search tools, environment configuration, safe errors, pagination and retries.

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

| Layer | Purpose | Evidence |
| --- | --- | --- |
| Static | Strict types and compilation | typecheck/build |
| Unit/fault | Configuration, transport errors, bounded retries, deadlines | Node test runner |
| MCP integration | Discovery, schemas, tool execution, safe failures | SDK client over transports |
| Real-store integration | Native WooCommerce API and auth semantics | seeded Docker store |
| End-to-end | Spawn compiled server, discover and invoke tools | stdio demo report |
| Submission | Secret checks, documentation accuracy, clean Git state | final verification |

## Completion record

- Phase 1: implemented; initial seven tests, typecheck and build passed.
- Phases 2–5: in progress. Update this record with actual evidence as work completes.
