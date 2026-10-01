# ADR 003 — Local, bounded and allowlisted telemetry

Status: accepted, 2 October 2026.

Use JSON events on stderr, generated correlation IDs, fixed operation/error names, durations and capacity gauges. Never log URLs, credentials, tool arguments, search terms, upstream bodies or merchant record text. Use a hash-derived store reference rather than its domain.

Keep fixed-cardinality aggregate counters and high-water marks in memory; expose a read-only diagnostics resource and shutdown summary. If stderr is backpressured, stop writing and count dropped log events until drain rather than building an unbounded logging queue. This deliberately sacrifices individual log events to preserve connector reliability.

A small TypeScript inspection command summarizes saved JSON logs locally. No external monitoring service is required. Percentile/throughput measurements belong to an explicitly described finite test run, not continuously growing runtime arrays.
