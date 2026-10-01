# WooCommerce Merchant Connector

A read-only TypeScript MCP connector for Razorpay's Forward-Deployed Engineer assignment. It lets an agent inspect orders and product inventory in one configured WooCommerce store.

**Status:** connector foundation implemented; live WooCommerce authentication, local-store startup and an agent demonstration remain to be verified. Automated tests use synthetic upstream responses and are not evidence of a live integration.

## Stack

TypeScript, Node.js 22+, Zod, official MCP TypeScript SDK, native fetch, and Node's test runner. WordPress/WooCommerce and MariaDB are external test infrastructure, not application code.

## Install and check

```sh
npm ci
npm run check
cp .env.example .env
```

Set the store root URL and a WooCommerce **Read** consumer key/secret in `.env`. Never commit this file. Use a test store with fictional data. WooCommerce API keys are created under WooCommerce → Settings → Advanced → REST API. The key's associated WordPress user must have permission to read the selected records.

```sh
npm run build
npm start
```

The server communicates over stdio; it waits for an MCP client and does not open a website. stdout is reserved for MCP messages.

## Connect an MCP client

Use your MCP client's server configuration with absolute paths:

```json
{
  "mcpServers": {
    "woocommerce": {
      "command": "node",
      "args": ["--env-file=/absolute/path/to/Razorpay/.env", "/absolute/path/to/Razorpay/dist/src/index.js"]
    }
  }
}
```

This is a local MCP configuration example, not a verified Agent Studio configuration. Agent Studio transport/access requirements were not supplied in the assignment. Remote hosting and Streamable HTTP are not implemented.

## Tools

| Tool | Inputs | Result |
| --- | --- | --- |
| `list_orders` | page, per_page, optional status | Order summaries with pagination |
| `search_orders` | search, page, per_page | Native WooCommerce search results |
| `get_order` | internal numeric id | One order and its line items |
| `list_products` | page, per_page, optional stock_status | Product inventory summaries |
| `search_products` | search and/or sku, page, per_page | Product matches |
| `get_product` | internal numeric id | One product and inventory fields |

MCP `tools/list` exposes the authoritative JSON schemas, descriptions, and read-only annotations. Source definitions are in `src/server.ts`. Pages default to 10 items and are capped at 50. Call the returned nextPage explicitly. Missing pagination headers produce null totals; null nextPage with unknown totals does not establish completeness.

## Merchant scenario

“Find processing orders and check whether their products are currently in stock.”

1. Call `list_orders` with status `processing`.
2. Select an order ID from results and call `get_order`.
3. For its simple products, call `get_product` using line-item product IDs.
4. Explain the retrieved status and inventory, including uncertainty.

A display order number can differ from the internal ID. Inventory is current stock, not a reservation or a guarantee of shipment. Variable-product availability requires variant-level data, which this version does not expose.

## Reliability and boundaries

- Credentials travel in the Authorization header, never query parameters. Redirects are refused.
- HTTPS is required except explicitly enabled loopback HTTP for fictional local data.
- Only GET requests to orders/products endpoints are supported. No refunds, payment recovery, stock changes, or order updates.
- 429/502/503/504 get up to three attempts with backoff and jitter. Retry-After is honored; waits over five seconds return an actionable error instead of retrying early. Whole request deadline: 25 seconds.
- Auth errors, missing records, invalid responses and connection failures return safe errors. Upstream bodies and secrets are not exposed.
- Responses use a field allowlist that excludes addresses, contact data, customer notes, metadata, and product descriptions. Product names remain untrusted data.
- One trusted local operator and one store per process. No multi-tenant authorization, customer identity verification, shared concurrency limiter, or distributed quota management.
- No OAuth, webhook ingestion, semantic search, shipment tracking or individual product-variation retrieval.

See [local-store setup](docs/local-store.md) and [delivery milestones](docs/implementation-plan.md).

## References

- [WooCommerce REST API](https://developer.woocommerce.com/docs/apis/rest-api/)
- [WooCommerce API reference](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [Official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)
