/**
 * CLI: loxtep data-products list | get | query | tables | create
 */

import { requireCliClient } from '../create-cli-client.js';
import type { DataProductCreateInput } from '../../client/data-products-types.js';

export interface DataProductsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runDataProductsList(options: DataProductsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.data_products.list({ page_size: 20 });
  console.log(JSON.stringify(result, null, 2));
}

export async function runDataProductsGet(
  dataProductId: string,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const asset = await client.data_products.get(dataProductId);
  console.log(JSON.stringify(asset, null, 2));
}

export async function runDataProductsQuery(
  dataProductId: string,
  sql: string,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.data_products.query(dataProductId, sql);
  console.log(JSON.stringify(result, null, 2));
}

export async function runDataProductsTables(
  dataProductId: string,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.data_products.list_tables(dataProductId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runDataProductsCreate(
  body: DataProductCreateInput,
  options: DataProductsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const created = await client.data_products.create(body);
  console.log(JSON.stringify(created, null, 2));
}
