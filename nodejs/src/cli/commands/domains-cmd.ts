/**
 * CLI: loxtep domains list | domains get <id>
 * Uses SDK domains surface (GET /organizations/domains).
 */

import { toDomainListSummary } from '../../client/list-summaries.js';
import { mapPaginatedList, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';

export interface DomainsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

export async function runDomainsList(options: DomainsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.define.domains.list();
    const summary = mapPaginatedList(result, toDomainListSummary);
    printCliListOutput(summary, result, { ...options, label: 'domains list' });
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runDomainsGet(
  domainId: string,
  options: DomainsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const domain = await client.define.domains.get(domainId);
    console.log(JSON.stringify(domain, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
