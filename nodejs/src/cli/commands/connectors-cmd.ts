/**
 * CLI: loxtep connectors list | test | capture-samples
 *
 * Org-level connectors. Connectivity probe vs sample capture are separate:
 *   - `test`            → POST /connectors/{id}/test
 *   - `capture-samples` → POST /connectors/{id}/capture-samples (needs --entity-type)
 *
 * There is no `loxtep connector test` (singular) command — always `connectors`.
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

export async function runConnectorsTest(
  connectorId: string,
  options: ConnectorsCmdOptions = {}
): Promise<void> {
  if (!connectorId) {
    console.error('Usage: loxtep connectors test <connector_id>');
    process.exitCode = 1;
    return;
  }
  const { client } = await requireCliClient(options);
  try {
    const result = await client.connect.connectors.test(connectorId);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runConnectorsCaptureSamples(
  params: {
    connector_id: string;
    entity_type?: string;
    limit?: number;
  },
  options: ConnectorsCmdOptions = {}
): Promise<void> {
  const connectorId = params.connector_id;
  const entityType = params.entity_type;
  if (!connectorId || !entityType) {
    console.error(
      'Usage: loxtep connectors capture-samples <connector_id> --entity-type <name> [--limit N]'
    );
    process.exitCode = 1;
    return;
  }
  const { client } = await requireCliClient(options);
  try {
    const result = await client.connect.connectors.capture_samples(connectorId, {
      entity_type: entityType,
      limit: params.limit,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
