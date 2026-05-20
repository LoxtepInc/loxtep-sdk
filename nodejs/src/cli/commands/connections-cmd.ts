/**
 * CLI: loxtep connections list | connections get <id> | connections create ... | connections test <id>
 */

import { requireCliClient } from '../create-cli-client.js';

export interface ConnectionsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runConnectionsList(options: ConnectionsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.connections.list({ page_size: 50 });
  console.log(JSON.stringify(result, null, 2));
}

export async function runConnectionsGet(
  connectionId: string,
  options: ConnectionsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const conn = await client.connections.get(connectionId);
  console.log(JSON.stringify(conn, null, 2));
}

export async function runConnectionsCreate(
  params: {
    name?: string;
    type?: string;
    key?: string;
    data?: string;
    configuration?: Record<string, unknown>;
  },
  options: ConnectionsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const name = params.name ?? '';
  const type = params.type ?? 'api';
  const key = params.key ?? params.name ?? '';
  if (!name || !key) {
    console.error('Missing required: --name, --type, --key');
    process.exitCode = 1;
    return;
  }
  const conn = await client.connections.create({
    name,
    type: type as 'database' | 'api' | 'webhook' | 'file',
    key,
    data: params.data ?? '{}',
    configuration: params.configuration,
  });
  console.log(JSON.stringify(conn, null, 2));
}

export async function runConnectionsTest(
  connectionId: string,
  options: ConnectionsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.connections.test(connectionId);
  console.log(JSON.stringify(result, null, 2));
}
