/**
 * CLI: loxtep connectors list [--type sdk]
 */

import type { Connector } from '../../client/connectors-types.js';
import { mapListSummaries, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';

export interface ConnectorsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

export interface ConnectorListSummary {
  connector_id: string;
  connector_type: string;
  name?: string | null;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
}

export function toConnectorListSummary(connector: Connector): ConnectorListSummary {
  const meta = connector.metadata ?? {};
  return {
    connector_id: connector.connector_id,
    connector_type: connector.connector_type,
    name: typeof meta.name === 'string' ? meta.name : null,
    organization_id: connector.organization_id,
    created_at: connector.created_at,
    updated_at: connector.updated_at,
  };
}

export async function runConnectorsList(
  params: { type?: string } = {},
  options: ConnectorsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.connect.connectors.list({
      connector_type: params.type,
      page_size: 100,
    });
    const summary = mapListSummaries(result, toConnectorListSummary);
    printCliListOutput(summary, result, { ...options, label: 'connectors list' });
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
