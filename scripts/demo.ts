import { assessStock } from '../src/application/inventory.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { connect } from './mcp-client.js';
import { orderSchema, productSchema, variationSchema } from '../src/contracts/records.js';

async function main() {
  const client = await connect(process.env.MCP_ENV_FILE ?? '.local/connector.env');
  const trace: unknown[] = [];
  try {
    const tools = await client.listTools();
    console.log(`Connected over stdio; discovered ${tools.tools.length} read-only tools.`);
    async function call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      if (result.isError || !result.structuredContent)
        throw new Error(`Tool ${name} failed. Run the live tests to diagnose.`);
      if (trace.length >= 200) throw new Error('Demo tool-call budget exceeded.');
      trace.push({ tool: name, arguments: args, result: result.structuredContent });
      return z
        .object({ data: z.unknown(), pagination: z.unknown().optional() })
        .parse(result.structuredContent);
    }
    const rows: string[] = [];
    for (const status of ['processing', 'on-hold']) {
      let nextPage: number | null = 1;
      let pages = 0;
      while (nextPage !== null) {
        if (++pages > 20) throw new Error('Demo page budget exceeded; narrow the workflow.');
        const result = await call('list_orders', { status, page: nextPage, per_page: 2 });
        const orders = z.array(orderSchema).parse(result.data);
        nextPage = z.object({ nextPage: z.number().nullable() }).parse(result.pagination).nextPage;
        for (const summary of orders) {
          const order = orderSchema.parse((await call('get_order', { id: summary.id })).data);
          for (const line of order.line_items) {
            const product = productSchema.parse(
              (await call('get_product', { id: line.product_id })).data,
            );
            const inventory =
              line.variation_id > 0
                ? variationSchema.parse(
                    (
                      await call('get_product_variation', {
                        product_id: line.product_id,
                        variation_id: line.variation_id,
                      })
                    ).data,
                  )
                : product;
            const stock = assessStock(
              product,
              line.quantity,
              line.variation_id > 0 ? inventory : undefined,
            );
            rows.push(
              `Order #${order.number} (${order.status}): ${line.name} × ${line.quantity} — ${stock.verdict}; current quantity: ${stock.quantity ?? 'untracked'}.`,
            );
          }
        }
      }
    }
    console.log(rows.join('\n'));
    console.log(
      'These are stock observations, not shipment promises or inventory reservations. No writes performed.',
    );
    await mkdir('evidence', { recursive: true });
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'deterministic MCP client workflow against real WooCommerce; not an LLM-generated answer',
      question: 'Which processing or on-hold orders have stock concerns?',
      findings: rows,
      trace,
    };
    // This command is intended only for the provided fictional store. Exporting other store data requires deliberate opt-in.
    if (process.env.MCP_ENV_FILE && process.env.ALLOW_DEMO_EXPORT !== 'true') {
      console.log(
        'Report export skipped for custom environment. Set ALLOW_DEMO_EXPORT=true only for fictional data.',
      );
    } else await writeFile('evidence/demo.json', JSON.stringify(report, null, 2) + '\n');
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
