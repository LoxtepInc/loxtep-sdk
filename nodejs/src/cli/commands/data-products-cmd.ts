/**
 * CLI: loxtep data-products list | get | query | tables | create
 */

import { toDataProductListSummary } from '../../client/list-summaries.js';
import { mapListSummaries, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';
import type { DataProductCreateInput } from '../../client/data-products-types.js';

export interface DataProductsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

export async function runDataProductsList(options: DataProductsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.build.data_products.list({ page_size: 20 });
  const summary = mapListSummaries(result, toDataProductListSummary);
  printCliListOutput(summary, result, { ...options, label: 'data-products list' });
}

export async function runDataProductsGet(
  dataProductId: string,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const asset = await client.build.data_products.get(dataProductId);
  console.log(JSON.stringify(asset, null, 2));
}

export async function runDataProductsQuery(
  dataProductId: string,
  sql: string,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.build.data_products.query(dataProductId, sql);
  console.log(JSON.stringify(result, null, 2));
}

export async function runDataProductsTables(
  dataProductId: string,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.build.data_products.list_tables(dataProductId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runDataProductsCreate(
  body: DataProductCreateInput,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const created = await client.build.data_products.create(body);
  console.log(JSON.stringify(created, null, 2));
}

export async function runDataProductsReadiness(
  dataProductId: string,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.build.data_products.readiness(dataProductId);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runDataProductsPromote(
  dataProductId: string,
  targetTier: 'silver' | 'gold',
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.build.data_products.promote(dataProductId, targetTier);
    if (result.success) {
      console.log(`✅ Promoted to ${result.new_tier}`);
      if (result.entity_iris?.length) {
        console.log(`   Minted ${result.entity_iris.length} entity IRI(s)`);
      }
    } else {
      console.error('❌ Promotion rejected:');
      for (const d of result.diagnostics ?? []) {
        const icon = d.satisfied ? '✓' : '✗';
        console.error(`   ${icon} ${d.name}${d.remediation ? ` — ${d.remediation}` : ''}`);
      }
      process.exitCode = 1;
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
