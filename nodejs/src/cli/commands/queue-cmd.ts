/**
 * CLI: loxtep queue info <data-product-id> | queue info --queue <queue-name> | queue checkpoint <id> --bot <bot-id>
 */

import { requireCliClient } from '../create-cli-client.js';

export interface QueueCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runQueueInfo(
  dataProductIdOrQueueName: string,
  opts: { queueName?: boolean } & QueueCmdOptions
): Promise<void> {
  const { client } = await requireCliClient(opts);
  if (opts.queueName) {
    const meta = await client.observe.get_queue_metadata(dataProductIdOrQueueName);
    console.log(JSON.stringify(meta, null, 2));
  } else {
    const meta = await client.build.data_products.get_queue_info(dataProductIdOrQueueName);
    console.log(JSON.stringify(meta, null, 2));
  }
}

export async function runQueueCheckpoint(
  dataProductId: string,
  botId: string,
  options: QueueCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const checkpoint = await client.build.data_products.get_reader_checkpoint(dataProductId, botId);
  console.log(JSON.stringify(checkpoint, null, 2));
}
