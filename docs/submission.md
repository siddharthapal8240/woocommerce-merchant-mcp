# Assignment 3 submission

**Project:** WooCommerce Merchant MCP — a private, read-only merchant connector implemented in TypeScript.

**Repository:** https://github.com/siddharthapal8240/woocommerce-merchant-mcp

## Requirement mapping

| Assignment requirement                        | Implementation and evidence                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Choose one supported merchant tool            | WooCommerce 10.2.2 on a real local WordPress store                                                                                      |
| Working OAuth or API-key authentication       | Native WooCommerce consumer key/secret over verified HTTPS; Read-only key                                                               |
| Suitable list/get/search primitives           | Eight tools for orders, products and variations; real-store tests                                                                       |
| Rate-limit handling                           | Bounded concurrency/queue, per-store pacing and coordinated Retry-After, jittered retries, whole-operation deadline and overload errors |
| MCP specification or equivalent               | `docs/mcp-tools.json`, generated from actual MCP discovery                                                                              |
| What the agent can/cannot do                  | README and `docs/architecture.md`                                                                                                       |
| Setup/run instructions                        | `npm ci`, store setup/seed, checks, live tests and demo; `docs/local-store.md`                                                          |
| No customer data or credentials in submission | Fictional fixtures; credentials remain in ignored local files                                                                           |

## Suggested submission description

I built a TypeScript MCP connector that gives an agent read-only access to WooCommerce orders and inventory. It supports native API-key authentication over HTTPS, eight validated tools, pagination, bounded concurrency and queueing, coordinated throttling, total deadlines, cancellation and safe error responses. The modular monolith separates transport, application services and integration mappings, and provides redacted correlation logs, aggregate diagnostics and graceful shutdown. A reproducible Docker setup creates a real WooCommerce store with fictional products and orders. The repository includes unit/protocol tests, live authentication and permissions checks, an end-to-end stdio MCP demo, and the generated tool specification.

The included demo is a deterministic MCP client workflow; an LLM host can use the supplied configuration and merchant prompts. Direct Razorpay Agent Studio connectivity has not been tested because account/transport access was not provided.

## Two-minute walkthrough

1. Explain the merchant question: identify current stock concerns on processing and on-hold orders.
2. Show `npm run demo`: the client discovers tools and reads actual order/product/variation records.
3. Show the out-of-stock tote and size-L hoodie, and explain why parent product stock alone is insufficient.
4. Show the live tests: successful read key, rejected bad secret, denied write, pagination and missing record handling.
5. Show the rate-limit fault tests and the generated MCP tool schemas.
6. State limits: current observations, not fulfillment guarantees; no mutations; one store per process; stdio host integration.

Use the hiring team's requested account/access arrangement if keeping the repository private. Never submit `.env`, `.local/`, database volumes or real merchant exports. The application form itself has not been submitted.
