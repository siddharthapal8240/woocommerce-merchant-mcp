# Design and tradeoffs

## Merchant problem

A support or operations agent needs current order and inventory facts without asking an engineer to manually query the store. The connector exposes a deliberately small read-only surface, with enough context to distinguish out-of-stock items, untracked inventory and product variations.

## Request path

MCP host → stdio JSON-RPC → Zod-validated tool → WooCommerce HTTP client → authenticated REST API → allowlisted record → structured MCP result.

The LLM host decides which tools to call. The connector does not run a model or invent an answer. A deterministic TypeScript client is provided to reproduce a merchant workflow without buying model credits.

## Modules

- `src/config.ts`: validate operator-supplied store URL and credentials.
- `src/client.ts`: GET-only endpoint allowlist, header auth, projections, deadlines, bounded responses and retries.
- `src/schemas.ts`: safe order/product/variation response contracts and shared input constraints.
- `src/server.ts`: tool registration, MCP descriptions/annotations and error mapping.
- `src/index.ts`: stdio entry point, with no stdout logging outside the protocol.
- `scripts/`: local infrastructure setup, fictional fixture seeding, MCP schema export and demo clients, all TypeScript.

## Authentication and trust boundaries

WooCommerce consumer-key authentication is an accepted alternative to OAuth in the assignment. Credentials are environment-supplied, never tool arguments. The connector is intended for a trusted merchant operator; access to its process grants access to the configured store's allowed read surface. It is not a customer-facing authorization boundary.

Use a WooCommerce **Read** key associated with an appropriately privileged store user. Runtime enforcement has two layers: the connector only issues GET to approved endpoints; WooCommerce separately denies writes for that key. HTTPS protects credentials for remote stores. The local fixture uses verified HTTPS with a project-specific CA; HTTP is rejected. Redirects are refused to prevent credentials being sent to another destination.

The test setup creates separate read and read/write fixture keys in the dedicated local database using WooCommerce's key hash format. It does not bypass API authentication: live calls still pass through WooCommerce's native key verification and permissions. Production keys should be created in the WooCommerce UI. Database provisioning is only a repeatable local fixture mechanism.

## Reliability choices

- Each upstream operation has a 25-second total deadline including retries and response reading.
- 429, 502, 503 and 504 can retry up to twice after the initial request.
- Retry-After numeric seconds or HTTP dates are honored. A delay beyond five seconds returns `UPSTREAM_BUSY` and a retry hint, allowing the host to schedule later.
- Otherwise, exponential backoff with jitter reduces synchronized retries.
- Authentication, validation, missing records and other HTTP errors are not retried.
- Network failures fail safely without retries; automatic retries are limited to explicit transient HTTP statuses.
- Responses are capped at 1 MiB and pages at 50 records. `_fields` minimizes upstream payloads; response Zod contracts independently strip undeclared fields.
- Cancellation propagates from MCP to fetch and retry waits.

No global rate limiter is claimed. Multiple concurrent calls or processes may still exceed store-specific quotas. A production deployment should add store-scoped scheduling and observed quota metrics.

## Correctness and data minimization

A WooCommerce order number can be customized and is not always its internal ID. Tools explicitly distinguish them. Search follows native WooCommerce matching; it is not a semantic or guaranteed exact-number lookup.

Order output excludes billing addresses, customer email, notes and metadata. Product output excludes descriptions. Remaining product/line-item names are untrusted text, and the server instructs the host not to obey instructions embedded in data. These measures reduce exposure; they do not prove all merchant-entered names are free of personal data.

Money is returned as WooCommerce decimal strings without floating-point arithmetic. Stock nullability is preserved. Variation tools expose exact size/color inventory; parent-managed variation stock requires checking the parent. Stock is an observation at fetch time, not a promise of fulfillment or a reservation.

## Transport choice and Agent Studio

Stdio provides a local, private process boundary and straightforward reproduction without opening an unauthenticated network listener. The checked-in `docs/mcp-tools.json` is the MCP tool specification requested by the assignment. MCP hosts can use the supplied configuration and prompts.

No Agent Studio account or transport documentation was supplied. Direct Agent Studio compatibility is therefore unverified. If its deployment requires a hosted connector, add Streamable HTTP with authentication, origin/host validation, merchant isolation, credential storage and deployment-specific controls before making it reachable remotely.

## Deliberate scope

One store per process; read-only orders, products and variations; no tickets, payment collection, refunds, inventory writes, shipment tracking, webhooks or background synchronization. No model provider or API key is required to run the deterministic demonstration.
