/**
 * CLI: loxtep data-contracts list | data-contracts get <id>
 * Data contracts (backend). Uses SDK data_contracts surface (GET /dataproducts/datacontracts).
 */

import { toDataContractListSummary } from '../../client/list-summaries.js';
import { mapListSummaries, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';

export interface DataContractsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

export async function runDataContractsList(options: DataContractsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.define.data_contracts.list();
    const summary = mapListSummaries(result, toDataContractListSummary);
    printCliListOutput(summary, result, { ...options, label: 'data-contracts list' });
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
    const item = await client.define.data_contracts.get(contractId);
    console.log(JSON.stringify(item, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

/**
 * Create a contract. `schema_ref` or `schema_version_id` binds a shape on create.
 * Bind a contract that already exists with PUT /dataproducts/datacontracts/{id}
 * (`client.define.data_contracts.update`), which accepts the same fields.
 */
export async function runDataContractsCreate(
  payload: {
    data_product_id: string;
    name: string;
    description?: string;
    version?: string;
    status?: string;
    terms?: Record<string, unknown>;
    schema_version_id?: string;
    schema_ref?: {
      schema_version_id: string;
      version?: string;
      format?: string;
    };
  },
  options: DataContractsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const created = await client.define.data_contracts.create(payload);
    console.log(JSON.stringify(created, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
