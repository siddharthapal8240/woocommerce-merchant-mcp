# WooCommerce Merchant MCP

A TypeScript connector that lets an agent read a merchant's orders and inventory through eight MCP tools. Built for Razorpay's Forward-Deployed Engineer assignment, option 3.

**Verified:** native WooCommerce API-key authentication over HTTPS, all eight tools through a compiled stdio MCP server, real-store search and pagination, variant inventory, and WooCommerce's rejection of writes with the connector's read-only key.

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

## Reliability and limits

- GET-only endpoints, read-only key, HTTPS, header credentials and refused redirects.
- Bounded retries for 429/502/503/504; numeric/date Retry-After support; long waits return an actionable error. Total upstream deadline: 25 seconds.
- Cancellation propagation, 1 MiB response limit, upstream field projection and response validation.
- Customer contact details, addresses, notes and metadata are excluded from tool results. Merchant-entered names remain untrusted text.
- Decimal money strings and null stock quantities are preserved. Internal order IDs may differ from display numbers. Parent-managed variation stock requires checking the parent.
- One store and trusted operator per process. No multi-tenant authorization, global quota coordination, refunds, payment collection, order writes or inventory updates.
- Stdio transport only. Agent Studio access and hosted transport compatibility are not claimed.

## Testing and documentation

| Command                | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `npm run check`        | Formatting, strict types, 15 unit/protocol/fault tests, build                      |
| `npm run test:live`    | Real WooCommerce authentication, eight tools, pagination, errors and denied writes |
| `npm run demo`         | Compiled server → stdio MCP client → real store; saves fictional evidence          |
| `npm run tools:export` | Regenerate the MCP tool specification                                              |

GitHub Actions runs both the static/unit suite and a fresh real-store end-to-end job.

- [Phased plan and acceptance criteria](docs/implementation-plan.md)
- [Architecture and tradeoffs](docs/architecture.md)
- [Local store setup](docs/local-store.md)
- [Demo walkthrough](docs/agent-demo.md)
- [Verification record](docs/verification.md)
- [Submission summary and walkthrough](docs/submission.md)

## References

[WooCommerce REST API](https://developer.woocommerce.com/docs/apis/rest-api/) · [API reference](https://woocommerce.github.io/woocommerce-rest-api-docs/) · [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server) · [WP-CLI](https://developer.wordpress.org/cli/commands/)
