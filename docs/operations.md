# Operations and diagnostics

## Trusted configuration

Set values in the connector environment or ignored `.env`. Model arguments cannot override them. Configuration is validated at startup.

| Variable                                | Default  | Accepted bounds                                 |
| --------------------------------------- | -------- | ----------------------------------------------- |
| `WC_STORE_URL`                          | required | HTTPS store root; no credentials/query/fragment |
| `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET` | required | Read-only runtime credentials                   |
| `WC_MAX_CONCURRENCY`                    | 4        | 1–16                                            |
| `WC_QUEUE_CAPACITY`                     | 16       | 0–128                                           |
| `WC_STARTS_PER_SECOND`                  | 5        | 1–50; minimum spacing, not a burst allowance    |
| `WC_DEADLINE_MS`                        | 25000    | 100–60000; includes queue/retries               |
| `WC_MAX_ATTEMPTS`                       | 3        | 1–3 total attempts                              |
| `WC_MAX_RESPONSE_BYTES`                 | 1048576  | 1024–1048576                                    |
| `WC_SHUTDOWN_MS`                        | 5000     | 100–10000                                       |

These are defensive defaults, not assertions of WooCommerce capacity. Start conservatively, observe errors/latencies and configure according to the actual merchant store. With multiple processes, each gets its own limits; shared store quotas require external coordination or partitioned budgets.

## Observe locally

```sh
MCP_LOG_FILE=.local/connector.ndjson npm run demo
npm run logs:inspect -- .local/connector.ndjson
```

`MCP_LOG_FILE` belongs to the demo client, which drains the connector's stderr and optionally saves it. The connector writes only JSON-RPC to stdout. An MCP host can capture stderr itself, or a direct local launch can redirect it:

```sh
NODE_EXTRA_CA_CERTS="$PWD/.local/root.crt" node --env-file=.local/connector.env dist/src/index.js 2> .local/connector.ndjson
```

The direct launch waits for an MCP client on stdin. Never put a terminal's human-readable output into the protocol stream.

Every admitted application operation has a generated request ID, returned in the result or safe error. Logs use that ID across admission, start, upstream attempts, retries and completion. An opaque store reference identifies the configured store without logging its domain. Events include latency, queue wait, status/error classification, attempts, throttle delays and active/queued gauges.

The read-only MCP resource `diagnostics://metrics` exposes limits, counters, high-water marks, total/max operation latency, accumulated queue wait, failure counts by fixed error code and dropped-log count. A shutdown event includes a final aggregate snapshot. This is operational telemetry, not a durable audit trail or distributed metric backend.

Stderr backpressure stops further writes until drain; events are dropped and counted rather than queued in memory. A permanently unread stderr stream can lose shutdown logs. Counters remain available via the diagnostics resource until transport shutdown. The local inspection command streams the generated NDJSON and reports aggregate counts and mean duration; it does not print merchant data.

## Troubleshooting by symptom

| Symptom              | Inspect / action                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OVERLOADED`         | Check max queue/active gauges; reduce host fan-out or retry later. Raising limits without store evidence can worsen contention.                       |
| `UPSTREAM_BUSY`      | Respect retryAfterMs; inspect throttle/retry counters. Restarting the process loses cooldown state and is not a legitimate way to avoid store limits. |
| `DEADLINE_EXCEEDED`  | Correlate queueWaitMs and attempt duration; distinguish queue pressure from a slow upstream.                                                          |
| `AUTH_FAILED`        | Check HTTPS, read key/secret pair and associated user permissions; do not retry blindly.                                                              |
| `CONNECTION_FAILED`  | Check destination URL, certificate trust and availability. Redirects are deliberately rejected.                                                       |
| `INVALID_RESPONSE`   | Check WooCommerce/plugin compatibility and requested page size. Raw records are deliberately absent from logs.                                        |
| `RESPONSE_TOO_LARGE` | Reduce page size or inspect store/plugin behavior outside the agent.                                                                                  |
| EOF / SIGTERM        | New reads stop; active and queued work is cancelled; pool closes. No pending writes exist to reconcile.                                               |
| Missing logs         | Inspect droppedLogs; make sure the host drains stderr. stdout must remain protocol-only.                                                              |

Application request deadlines end after mapping. A host that stops reading responses is handled by the separate bounded transport buffer/disconnection policy. No remote-service SLO, global rate limit or multi-tenant isolation is claimed.
