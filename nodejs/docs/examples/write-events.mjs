#!/usr/bin/env node
/**
 * Write sample events to a deployed source data product via get_writer.
 *
 * Prerequisites: login, init, attach, SDK ingest workflow deployed (see sdk-first-ingest.md).
 *
 *   node node_modules/@loxtep/sdk/docs/examples/write-events.mjs
 *
 * Env:
 *   LOXTEP_DATA_PRODUCT_NAME  default: app-events
 */

import { LoxtepClient } from '@loxtep/sdk';

const DATA_PRODUCT_NAME = process.env.LOXTEP_DATA_PRODUCT_NAME ?? 'app-events';

async function main() {
  const client = await LoxtepClient.fromWorkspace();

  console.error(`Opening writer for data product "${DATA_PRODUCT_NAME}"…`);
  const writer = await client.get_writer(DATA_PRODUCT_NAME);

  const events = [
    {
      event_id: `evt_${Date.now()}_1`,
      occurred_at: new Date().toISOString(),
      payload: { source: 'write-events.mjs', action: 'example_write', index: 1 },
    },
    {
      event_id: `evt_${Date.now()}_2`,
      occurred_at: new Date().toISOString(),
      payload: { source: 'write-events.mjs', action: 'example_write', index: 2 },
    },
  ];

  for (const event of events) {
    writer.write(event);
    console.log(JSON.stringify({ written: event.event_id }));
  }

  await writer.close();
  console.error('Writer closed — events flushed.');
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  if (/not deployed/i.test(message)) {
    console.error(
      '\nDeploy an SDK ingestion workflow first. See nodejs/docs/sdk-first-ingest.md'
    );
  }
  process.exit(1);
});
