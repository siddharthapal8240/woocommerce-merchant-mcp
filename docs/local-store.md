# Local fictional-data store

The connector and all custom scripts are TypeScript. The supplied Compose file runs the external WordPress and MariaDB software required by WooCommerce.

## Prerequisite

A Docker-compatible engine and Docker Compose. Neither is installed in the current development environment. The Compose setup has **not yet been run or verified**. It binds WordPress only to 127.0.0.1:8080 and leaves the database unexposed.

## Bootstrap

1. Start a Docker-compatible engine, then run `docker compose up -d`.
2. Open http://localhost:8080 and complete the WordPress installer. Choose a local-only admin password; do not reuse a real password.
3. Install and activate the official WooCommerce plugin from WordPress Plugins. Skip payment services and external connections. Use fictional store details.
4. Under WordPress Settings → Permalinks choose “Post name” and save.
5. Create simple fictional products with SKUs, prices, stock tracking and quantities. Include one out-of-stock product. Create fictional orders with differing statuses using those products. Do not configure real payments, email delivery or customer information.
6. Under WooCommerce Settings → Advanced → REST API generate a **Read** key associated with the local administrator.
7. Save credentials in ignored `.env`, with `WC_STORE_URL=http://localhost:8080` and `WC_ALLOW_LOCAL_HTTP=true`.
8. Run `npm run build` and connect an MCP client as described in the README.

The database passwords in compose.yaml are deliberately local-demo-only values. Never deploy this configuration publicly. `docker compose down` stops the stack while preserving data in volumes. Do not remove volumes unless the test data can be discarded.

## Still required before submission

Automate fictional fixture creation with a separate TypeScript setup script; verify API-key authentication and all six tools against this store; record the exact WooCommerce version; capture a real agent demonstration. The runtime connector must remain read-only even if a separate local seed script uses write credentials.
