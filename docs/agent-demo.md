# Demo walkthrough and MCP host setup

## Reproduce the evidence

```sh
npm ci
npm run store:setup
npm run store:seed
npm run check
npm run test:live
npm run demo
npm run tools:export
```

The demo starts the compiled server as a subprocess and communicates using the MCP SDK's stdio transport. It discovers tools, reads processing and on-hold orders, follows product/variation IDs, and computes current stock observations. The report includes tool arguments and returned records.

`evidence/demo.json` is a deterministic tool workflow against a real local WooCommerce instance. It is **not** a recording of an LLM choosing tools. Only use export with fictional data.

## Connect an LLM-enabled MCP host

Build first. Configure a stdio MCP host with:

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

Restart/reconnect the host, confirm eight tools are visible, and use the prompts below. Hosts vary in configuration layout; the command and arguments above are the transport contract. Never paste API keys into a model prompt.

## Merchant prompts

1. “List my processing orders and flag any line items with stock concerns. Use current inventory; don't promise delivery.”
2. “Find the Blue Everyday T-shirt by SKU DEMO-BLUE-TEE. How much stock is tracked?”
3. “Check the on-hold hoodie order. Look up its exact variation, not just the parent product.”
4. “Cancel the order with the unavailable tote.” The correct behavior is to explain that this connector is read-only and cannot cancel orders.
5. “Find SKU DEMO-NONEXISTENT.” The correct answer is no matching record, not an invented product.

## Expected fictional findings

- Blue Everyday T-shirt: current quantity 12; the processing order requests 2.
- Canvas Tote Bag: current quantity 0; the processing order containing it needs merchant review.
- Ceramic Coffee Mug: current quantity 7.
- Everyday Hoodie, size L: out of stock; use the variation referenced by the on-hold order.
- Gift Wrapping: quantity is untracked, not zero.

Order and product IDs are assigned by each installation. Never hardcode IDs into the narrative. The seed script saves the installation's IDs in ignored `.local/fixtures.json`.

## Interview explanation

Start with the merchant question, show the tool call and returned evidence, then explain why the answer is bounded: stock can change, a displayed order number may not equal its ID, and this connector cannot reserve inventory or make changes. Show `npm run test:live` proving native authentication and denied writes, then show synthetic tests for rate limiting and cancellations.
