# WooCommerce Merchant MCP

A TypeScript connector that lets an agent read a merchant's orders and inventory through eight MCP tools. Built for Razorpay's Forward-Deployed Engineer assignment, option 3.

**Implemented:** a single-store modular monolith with separate transport, application services, WooCommerce mappings, HTTP reliability and observability. Native authentication, all eight MCP tools, search, pagination, variants and denied writes are verified against a real HTTPS WooCommerce store.

## Merchant use case

> “Which processing or on-hold orders have stock concerns?”

The included fictional store has five products, two hoodie variations and four orders. The demo retrieves order line items and their current inventory, flags the unavailable tote and size-L hoodie, and avoids promising fulfillment. It runs against real WordPress/WooCommerce, not a mock API.

The included demo is a deterministic TypeScript MCP client. An LLM-enabled host can use the same tools and supplied prompts. Direct Agent Studio connectivity is unverified because no account or transport requirements were provided; the repository includes the MCP tool specification accepted by the assignment.

## Quick start

Requirements: Node.js 22.9+ or 24+, npm, a running Docker-compatible engine and Docker Compose; ports 8080 and 8443 free. Allow approximately 4 GB RAM for the local container environment and initial image downloads.

```sh
git clone https://github.com/siddharthapal8240/woocommerce-merchant-mcp.git
cd woocommerce-merchant-mcp
npm ci
npm run store:setup
npm run store:seed
npm run check
npm run test:live
npm run test:capacity
npm run demo
```

Setup installs a pinned WooCommerce version and generates random local credentials. Seeding is repeatable and reuses fixtures. Runtime credentials are read-only; a separate local write key is used only by the fixture script. Everything under `.local/`, plus `.env`, is ignored by Git.

See [local environment setup](docs/local-store.md) for macOS installation, TLS and troubleshooting.

## What the demo shows

```text
Connected over stdio; discovered 8 read-only tools.
Canvas Tote Bag × 1 — OUT OF STOCK; current quantity: 0.
Ceramic Coffee Mug × 1 — CURRENT STOCK SUFFICIENT; current quantity: 7.
Blue Everyday T-shirt × 2 — CURRENT STOCK SUFFICIENT; current quantity: 12.
Everyday Hoodie - L × 1 — OUT OF STOCK; current quantity: 0.
```

Actual output also includes the installation's order numbers. Evidence is in [the real-store MCP trace](evidence/demo.json). Stock observations are not reservations or shipment promises.

## Tools

| Tool                      | Inputs                                | Result                               |
| ------------------------- | ------------------------------------- | ------------------------------------ |
| `list_orders`             | page, per_page, optional status       | Order summaries and pagination       |
| `search_orders`           | search, page, per_page                | Native WooCommerce text matches      |
| `get_order`               | internal numeric id                   | Order details and line items         |
| `list_products`           | page, per_page, optional stock_status | Products and inventory               |
| `search_products`         | search and/or sku, page, per_page     | Product matches                      |
| `get_product`             | internal numeric id                   | Product and inventory fields         |
| `list_product_variations` | product_id, page, per_page            | Variations with stock and attributes |
| `get_product_variation`   | product_id, variation_id              | Exact variation inventory            |

The authoritative [MCP tool specification](docs/mcp-tools.json) is generated from `tools/list` using `npm run tools:export`. Tool inputs are validated with Zod. Pages default to 10 and are capped at 50. Follow `nextPage` explicitly; missing upstream pagination headers produce unknown totals, not a claim of completeness.

## Connect your agent

After building, configure a stdio MCP host:

```json
{
  "mcpServers": {
    "woocommerce": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/woocommerce-merchant-mcp/.local/connector.env",
        "/absolute/path/to/woocommerce-merchant-mcp/dist/src/index.js"
      ],
      "env": {
        "NODE_EXTRA_CA_CERTS": "/absolute/path/to/woocommerce-merchant-mcp/.local/root.crt"
      }
    }
  }
}
```

Use absolute paths. Local scripts trust only the generated project CA; no system-wide trust changes are required. See [the agent walkthrough](docs/agent-demo.md) for prompts and expected results.

### Connect another test store

Copy `.env.example` to `.env`. Set its HTTPS store root URL and a WooCommerce **Read** consumer key/secret created under WooCommerce → Settings → Advanced → REST API. The associated user must have read permissions for the records. Never put secrets in prompts or commit them.

```sh
npm run build
npm start
```

The server waits for JSON-RPC on stdin/stdout; it does not open a website. A normally certified remote store does not need the local CA. For the supplied local store, set `NODE_EXTRA_CA_CERTS` to the absolute `.local/root.crt` path before starting Node, or use the host configuration above.

## Reliability and operating bounds

- Four active operations and sixteen FIFO queue slots by default; overload returns a safe correlated error. Slots remain occupied through retries.
- Five upstream starts/second, shared process-local Retry-After cooldown, bounded jittered retries, and a 25-second deadline covering admission through mapping.
- Cancellation and shutdown clean up queued work, timers, abort listeners and owned HTTP connections. Stdio input/output buffers have explicit limits.
- 1 MiB maximum upstream response; at most 50 records per page; explicit field mappings exclude customer contact details, addresses, notes and metadata.
- Structured, allowlisted stderr logs with request IDs and fixed-cardinality counters. Slow logging drops events instead of accumulating a queue. Inspect the MCP resource `diagnostics://metrics` or saved logs:

```sh
MCP_LOG_FILE=.local/connector.ndjson npm run demo
npm run logs:inspect -- .local/connector.ndjson
```

A deterministic synthetic test offered 100 simultaneous calls: 20 completed, 80 received overload errors, maximum in-flight requests stayed at 4 and maximum queue depth at 16. This uses a fake clock and HTTP adapter; it is **not a WooCommerce performance claim**. [Conditions and results](evidence/capacity.json).

These controls are process-local, with one trusted operator/store per process. No multi-tenant isolation, distributed quota, cache or circuit breaker is claimed. The connector cannot refund, collect payments, change orders or update inventory. Merchant text remains untrusted. [Architecture and decisions](docs/architecture.md) · [Configuration and operations](docs/operations.md).

## Testing and documentation

| Command                              | Purpose                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run check`                      | Formatting, strict compilation, domain/adapter/MCP/reliability/lifecycle tests     |
| `npm run test:live`                  | Real WooCommerce authentication, eight tools, pagination, errors and denied writes |
| `npm run demo`                       | Compiled server → stdio MCP client → real store; saves fictional evidence          |
| `npm run test:capacity`              | Reproduce deterministic synthetic bounds/cooldown/cancellation evidence            |
| `npm run check:secrets -- --history` | Check candidate files and Git history for fixture secrets/private files            |
| `npm run tools:export`               | Regenerate the MCP tool specification                                              |

GitHub Actions checks Node.js 22 and 24, regenerates the tool specification, captures synthetic evidence, and runs a fresh real-store end-to-end job.

- [Phased plan and acceptance criteria](docs/implementation-plan.md)
- [Architecture and tradeoffs](docs/architecture.md)
- [Local store setup](docs/local-store.md)
- [Demo walkthrough](docs/agent-demo.md)
- [Verification record](docs/verification.md)
- [Submission summary and walkthrough](docs/submission.md)

## References

[WooCommerce REST API](https://developer.woocommerce.com/docs/apis/rest-api/) · [API reference](https://woocommerce.github.io/woocommerce-rest-api-docs/) · [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server) · [WP-CLI](https://developer.wordpress.org/cli/commands/)
