# Architecture and engineering boundaries

## Deployment and scope

This is a **single-store TypeScript modular monolith**, launched as a subprocess by a trusted local MCP host. One process owns one configured WooCommerce URL, one read-only credential pair, one scheduler and one outbound HTTP connection pool. It implements eight read tools and a diagnostics resource.

WordPress, MariaDB and Caddy are reproducible **test infrastructure**, not new connector services. Runtime application code has no dependency on the setup or fixture scripts. No cache, Redis, message broker, background worker or circuit breaker is needed for the demonstrated use case.

A hosted multi-tenant service is a different deployment: it would need authenticated merchant identity, tenant-scoped credentials and authorization, destination/network policy, coordinated quotas across replicas, and an authenticated remote MCP transport. None of that is claimed here. Direct Agent Studio connectivity remains unverified; the assignment permits an MCP specification, which is supplied.

## Request flow and modules

```text
Trusted MCP host → bounded stdio → thin MCP handler → order/inventory service
                 → bounded store scheduler → WooCommerce adapter → HTTP reliability → store
                 ← correlated result/error ← explicit allowlisted mappings
```

| Boundary      | Code                               | Responsibility                                                                                  |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Composition   | `src/bootstrap.ts`, `src/index.ts` | Wire explicit dependencies; own signals, transports and shutdown                                |
| Transport     | `src/transport/`                   | MCP registration, input schemas, result/error serialization, protocol buffers                   |
| Application   | `src/application/`                 | Order/inventory operations, result envelopes, pagination completeness, stock interpretation     |
| Contracts     | `src/contracts/`                   | Shared Zod record/input contracts and safe error classification                                 |
| Integration   | `src/infrastructure/woocommerce/`  | Fixed endpoints, upstream field selection, explicit order/product/variation mappings            |
| HTTP          | `src/infrastructure/http.ts`       | Header authentication, owned connection pool, response limits, retries and error classification |
| Reliability   | `src/reliability/`                 | FIFO admission, deadlines, pacing, shared cooldown, cancellable timers                          |
| Observability | `src/observability/`               | Correlated allowlisted events, fixed-cardinality counters, log backpressure                     |
| Non-runtime   | `scripts/`, `tests/`               | Setup/seed/demo/inspection and deterministic verification                                       |

The interfaces are narrow structural types where testing needs a substitute. There is no generic CRUD framework or dependency-injection container. Existing tool names and record fields are preserved; request IDs and pagination completeness are additive.

## Resource and failure policy

Defaults are four active operations, sixteen queued operations, five upstream starts per second, three attempts, a 25-second whole-operation deadline and a 1 MiB upstream response cap. Pages are at most 50 records. A slot remains occupied during pacing/retry waits and response mapping, so retries cannot create extra unbounded work.

1. Admission creates a generated correlation ID. A full queue returns `OVERLOADED` without creating request timers or making a network call.
2. Accepted requests enter FIFO order. Their deadline starts immediately, including time in the queue. Deadline checks at dispatch prevent a queued operation starting during a timer-callback race.
3. Before every HTTP attempt, the scheduler enforces minimum start spacing and the process-wide store cooldown. Existing in-flight requests are allowed to finish.
4. 429/503 extend the shared cooldown; an explicit Retry-After on another retryable status also coordinates the store. Seconds and standard HTTP dates are supported. Delay hints beyond a request's remaining budget produce `UPSTREAM_BUSY`, while retaining the cooldown for subsequent calls.
5. 502/504 without hints use local exponential backoff with jitter. At most three total attempts fit inside the original deadline. Network errors, auth failures and other non-retryable responses fail without speculative retries.
6. Cancellation interrupts queueing, pacing, backoff, HTTP and response reading. Completed/aborted requests remove deadline timers and external abort listeners. Both success and failure release their slot.
7. Shutdown rejects new work, cancels queued/active reads and destroys the owned outbound pool. MCP closes and a bounded shutdown timeout prevents a broken peer or connection from hanging the process. SIGTERM, SIGINT and stdin EOF use the same lifecycle.

The scheduler bounds upstream operation work, not total operating-system process RSS. JSON copies and the MCP SDK have overhead. Additional protocol limits are a 64 KiB incoming buffer and a 4 MiB outgoing writable-buffer ceiling; a stalled peer that exceeds the ceiling is disconnected. The OS/kernel may buffer additional bytes. Timers are cooperative: synchronous parsing cannot be preempted, so payload bounds and completion deadline checks remain important.

All quotas and cooldowns are **process-local**. Four replicas would multiply admissions and start rates unless budgets are explicitly partitioned or coordinated. We do not infer actual WooCommerce capacity from a synthetic harness.

## Error contract

| Failure                                        | Tool outcome / action                     |
| ---------------------------------------------- | ----------------------------------------- |
| Full admission queue                           | `OVERLOADED`; host retries later          |
| Store throttling / exhausted transient retries | `UPSTREAM_BUSY`, optional `retryAfterMs`  |
| Cancel / total deadline                        | `CANCELLED` / `DEADLINE_EXCEEDED`         |
| Process closing                                | `SHUTTING_DOWN`                           |
| Invalid key or permission                      | `AUTH_FAILED`; no retry                   |
| Missing record                                 | `NOT_FOUND`                               |
| Invalid/oversized upstream content             | `INVALID_RESPONSE` / `RESPONSE_TOO_LARGE` |
| Network/TLS/redirect failure                   | `CONNECTION_FAILED`                       |
| Unexpected internal failure                    | `INTERNAL_ERROR`                          |

Tool errors contain safe fixed messages and correlation IDs, never raw exception text or upstream bodies. MCP input validation occurs before application admission and uses the SDK's protocol behavior.

## Trust boundaries

- **Host → connector:** trusted local operator. Store identity and credentials come only from validated process configuration. Tool schemas reject extra fields, including proposed store URLs or credentials. This is not customer-level authorization.
- **Connector → store:** HTTPS, fixed endpoint paths, GET-only methods, header credentials, redirects refused, bounded owned pool. Destination roots may include legitimate store subdirectories but not credentials, query strings, fragments or REST endpoint paths. DNS resolution/private-address restriction is not a tenant security boundary: a trusted operator intentionally configures the local test destination. A hosted service would need stronger destination policy.
- **Store → agent:** merchant text is untrusted. Mappings exclude customer contact details, addresses, notes, metadata and descriptions. Product/line-item names can still contain merchant-entered sensitive text; minimization is not a guarantee that those strings contain no personal data. Host instructions must never treat record text as authority.
- **Fixture writes → runtime:** setup/seed credentials live under ignored `.local/`; the runtime environment receives only the read key. Native WooCommerce rejects writes with that key in live tests. Local key provisioning uses the dedicated fixture database; production keys should come from WooCommerce settings.
- **Logs:** only allowlisted operational fields; no URL, search term, credential, merchant record or raw error. Local CA trust is process-specific, without disabling certificate verification or changing the system trust store.

## Domain correctness

Keep money as decimal strings and null inventory as unknown/untracked. Display order numbers can differ from internal IDs. Search uses native WooCommerce semantics. Exact variation stock may depend on its parent; do not substitute a parent's stock for an independently managed variant. Product stock is a current observation, not a reservation, availability promise or delivery estimate.

Pagination returns `hasMore: null` when upstream headers are unavailable. At the configured page-index ceiling, `nextPage` can be null while `hasMore` is true; the host must not claim a complete scan. Oversized result lists are rejected rather than silently truncated.

## Decisions and evidence

- [ADR 001: deployment and module boundaries](adr/001-deployment-and-boundaries.md)
- [ADR 002: capacity, shutdown and consistency](adr/002-capacity-and-consistency.md)
- [ADR 003: telemetry and data](adr/003-observability-and-data.md)
- [Operations and observability](operations.md)
- [Verification conditions and measured evidence](verification.md)
