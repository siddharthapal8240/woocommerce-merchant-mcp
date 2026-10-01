# ADR 001 — Single-store modular monolith

Status: accepted, 2 October 2026.

The existing connector is a trusted local MCP subprocess with one WooCommerce store and one read-only credential pair. A hosted multi-tenant service is outside the assignment's verified scope.

Keep one TypeScript process. The composition root wires MCP transport → order/inventory services → WooCommerce adapter → reliability-controlled HTTP. Shared Zod contracts define allowed data. Setup, fixture writes and demos stay outside `src/`.

Preserve the eight tool names and their record fields. Keep thin, explicit methods instead of a configurable generic CRUD framework. Domain inventory interpretation lives in application code and can be unit-tested without MCP or HTTP.

Consequences: modules can be tested independently, but a process remains one failure domain. Hosting multiple merchants would require authenticated store selection, tenant-scoped credentials, authorization, network policy and distributed quota coordination. No such isolation or Agent Studio transport compatibility is claimed.
