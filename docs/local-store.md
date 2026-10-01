# Local fictional-data store

All custom setup, seed, application and test code is TypeScript. Docker runs the external WordPress, MariaDB, WP-CLI and Caddy software required by the test environment.

## Prerequisites

Node.js 22.9+ or 24+, npm, Docker engine and Compose. Free local ports 8080 and 8443. Container images are pinned by digest in compose.yaml; WooCommerce is pinned to 10.2.2.

For macOS without Docker Desktop, one option is [Colima](https://colima.run/docs/installation/):

```sh
brew install colima docker docker-compose
colima start --profile merchant-mcp --cpu 2 --memory 4 --disk 20 --vm-type vz --runtime docker
```

The setup script supports `docker compose` and the standalone `docker-compose` binary. A project-specific Colima VM was used during development. No paid hosting or model account is required.

## Bootstrap and seed

```sh
npm ci
npm run store:setup
npm run store:seed
```

Setup starts the dedicated `merchant-mcp` Compose project, installs WordPress and WooCommerce, configures permalinks and INR, creates two random API keys, and saves local files with restricted permissions. It preserves an unrelated existing `.env` and updates its own previously generated `.env`.

Seed creates/reuses five products, two variations and four orders. Unique SKUs and fixture metadata prevent duplicate fixture creation on repeated runs. Seeding restores known fictional stock values after order creation. Run seed only when no demo/test is concurrently relying on those stock values.

The process provisions local API keys directly in the isolated fixture database using WooCommerce's native hashed-key format. The connector authenticates through WooCommerce normally, with its read-only permission enforced server-side. For any non-fixture store, generate a Read key through WooCommerce's settings UI instead.

## HTTPS and credentials

WooCommerce's consumer-key Basic authentication requires HTTPS. Caddy provides HTTPS at `https://localhost:8443`, forwards requests to WordPress, and provides its own local CA. Setup exports that CA to `.local/root.crt`; TypeScript fixture scripts and spawned MCP clients trust it explicitly.

No TLS-verification bypass is used. The system/browser trust store is not changed. A browser may therefore show an untrusted-local-certificate warning; the automated demo uses verified TLS directly and does not need browser access.

Local files:

- `.local/credentials.json`: local admin password, read key and separate fixture-write key.
- `.local/connector.env`: read-only runtime credentials and HTTPS store URL.
- `.local/root.crt`: public project CA certificate; private CA material stays in the Docker volume.
- `.local/fixtures.json`: fixture product/variation/order IDs.
- `.env`: generated for convenience unless an unrelated file already exists.

Never commit any of these. The demo's checked-in report contains fictional data and no credentials. Database passwords in compose.yaml are deliberately local-demo-only values; never deploy this stack publicly.

## Verify

```sh
npm run check
npm run test:live
npm run demo
```

The stdio demo inherits the local CA trust in the spawned Node process. For a manually configured MCP host, include `NODE_EXTRA_CA_CERTS` as shown in README. For direct local startup on macOS/Linux:

```sh
NODE_EXTRA_CA_CERTS="$PWD/.local/root.crt" node --env-file=.local/connector.env dist/src/index.js
```

## Stop and resume

```sh
docker compose down
# Later:
npm run store:setup
```

Volumes preserve fixture data. Do not remove volumes unless you intend to discard this test store. To free the Colima VM's RAM after stopping the containers, use `colima stop --profile merchant-mcp`.

## Troubleshooting

- **Docker daemon unavailable:** start Docker Desktop or the Colima profile first.
- **`docker-credential-desktop` missing:** a previous Docker Desktop configuration may reference a removed helper. Use a dedicated Docker configuration instead of changing existing credentials. The setup scripts optionally read ignored `.local/docker-env.json` with `DOCKER_CONFIG` and `DOCKER_HOST` overrides for Docker commands only. During development, this pointed to `.local/docker/` and the `merchant-mcp` Colima socket.
- **401:** use the HTTPS URL, verify the matching key/secret, and confirm Read permissions. HTTP Basic authentication is not a supported fallback.
- **404 at the REST route:** rerun setup to restore permalinks and verify WooCommerce is active.
- **TLS error after rebuilding the proxy volume:** rerun setup to export its new CA certificate and restart the MCP client.
- **Ports occupied:** stop the conflicting local process or consistently change compose, setup, fixture URLs and documentation before running.
- **Unexpected plugin version:** the bootstrap refuses an existing store with a different WooCommerce version instead of silently replacing it.
