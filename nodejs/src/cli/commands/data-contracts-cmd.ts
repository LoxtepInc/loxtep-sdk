/**
 * CLI: loxtep data-contracts list | data-contracts get <id>
 * Data contracts (backend). Uses SDK data_contracts surface (GET /dataproducts/datacontracts).
 */

import { requireCliClient } from '../create-cli-client.js';

export interface DataContractsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runDataContractsList(options: DataContractsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.data_contracts.list();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runDataContractsGet(
  contractId: string,
  options: DataContractsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const item = await client.data_contracts.get(contractId);
    console.log(JSON.stringify(item, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
