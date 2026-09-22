/**
 * Sample: enrich an inbound Shopify order and write it to `orders_enriched`.
 *
 * Prerequisites (see README / `loxtep setup`):
 *   - attached non-production instance
 *   - `orders_enriched` data product provisioned and deployed
 *   - `loxtep generate` so `.loxtep/generated` exists
 *
 * `loxtep test` runs this handler locally against the attached instance
 * (live stream I/O — not an offline simulation). `dataProducts.write` is
 * gated by `requireApproval` so sample writes cannot silently hit the bus.
 */
import { defineDataWorkflow, on } from '@loxtep/sdk';
import { workspace } from '../.loxtep/generated/index.js';

export default defineDataWorkflow({
  name: 'orders-enricher',
  // Webhook trigger avoids depending on a friendly observe queue name.
  // After `loxtep setup`, you can switch to on.queueEvent(workspace.queues.*)
  // once a matching queue appears in `loxtep generate` output.
  triggers: [on.webhook('/shopify/orders')],
  requireApproval: ['dataProducts.write'],
  async handler(ctx, event) {
    const order = (event ?? {}) as Record<string, unknown>;
    await ctx.toolbox.dataProducts.write(workspace.dataProducts.orders_enriched, {
      ...order,
      enriched_at: new Date().toISOString(),
      source: 'orders-enricher',
    });
  },
});
