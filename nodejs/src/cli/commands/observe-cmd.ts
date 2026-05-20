/**
 * CLI: loxtep observe status
 */

import { requireCliClient } from '../create-cli-client.js';

export interface ObserveCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runObserveStatus(options: ObserveCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.observe.status();
  console.log(JSON.stringify(result, null, 2));
}
