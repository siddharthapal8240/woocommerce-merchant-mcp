# Verification record

Verified locally on 2 October 2026 (Asia/Kolkata).

## Environment

- macOS on Apple Silicon, Node.js 24.5.0.
- Dedicated Colima profile `merchant-mcp`: 2 CPUs, 4 GiB RAM, 20 GiB virtual disk.
- WordPress 6.8.3 / PHP 8.3, WooCommerce 10.2.2, MariaDB 11.4 and Caddy 2.10.2.
- Docker images pinned by digest; npm dependencies pinned in package-lock.json.
- Local HTTPS with project-specific CA trust. Native API-key authentication; no TLS verification bypass.

## Results

| Check                           | Observed result                                                     |
| ------------------------------- | ------------------------------------------------------------------- |
| Strict TypeScript and build     | Passed                                                              |
| Unit/protocol/fault suite       | 15 tests passed                                                     |
| Live WooCommerce integration    | Passed through the compiled stdio server                            |
| MCP tool discovery              | All eight read-only tools discovered                                |
| Order list/get/search           | Real seeded records returned; search matched fictional order data   |
| Product list/get/search         | SKU/text matching and stock filter returned expected records        |
| Pagination                      | Processing orders split over two distinct pages                     |
| Product variations              | Two hoodie variations retrieved; exact size L reported out of stock |
| Untracked stock                 | Gift Wrapping quantity remained null                                |
| Invalid API secret              | WooCommerce rejected it with HTTP 401                               |
| Runtime write attempt           | WooCommerce rejected the Read key with HTTP 401                     |
| Missing record                  | Safe NOT_FOUND tool error                                           |
| Unknown SKU                     | Empty result, no invented record                                    |
| Data minimization               | Order output omitted customer email and notes                       |
| Repeat setup and seed           | Completed; reused five products, two variations and four orders     |
| Deterministic merchant workflow | Actual MCP calls produced the committed fictional trace             |

The unit/fault suite additionally verifies numeric and HTTP-date Retry-After, backoff, retry exhaustion, cancellation, response-size limits, malformed responses, endpoint restrictions and safe errors. Those injected failures are synthetic; they do not claim that a live store was deliberately overloaded.

## Evidence and reproducibility

- `evidence/demo.json`: real-store tool arguments, structured results and deterministic findings.
- `docs/mcp-tools.json`: specifications exported from the server's actual tool discovery response.
- `npm run check`: formatting, types, unit/protocol/fault suite and build.
- `npm run test:live`: real-store verification; run setup and seed first.
- `npm run demo`: reproduce the MCP trace using the seeded store.

The trace is a programmatic MCP workflow, not an LLM conversation. The assignment's MCP specification requirement is implemented; direct Agent Studio connectivity requires access and is not claimed. GitHub Actions separately bootstraps a fresh store and runs the live suite and demo.
