/**
 * CLI: loxtep deployments list|get
 *
 * SDK/MCP parity for deployment status polling (`client.observe.list_deployments` /
 * `get_deployment`, MCP `loxtep_observe`). Prefer this over inventing
 * `workflows deploy --status`.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { DeploymentStatus } from '../../client/deployments-types.js';
import type { CliResult } from '../project-context.js';

const VALID_STATUSES: DeploymentStatus[] = [
  'pending',
  'in_progress',
  'deployed',
  'failed',
  'rolled_back',
  'archived',
];

export interface DeploymentsListOptions {
  project_id?: string;
  instance_id?: string;
  workflow_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export async function runDeploymentsListCommand(
  client: LoxtepClient,
  options?: DeploymentsListOptions
): Promise<CliResult> {
  if (options?.status && !VALID_STATUSES.includes(options.status as DeploymentStatus)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Invalid status filter: '${options.status}'. Must be one of: ${VALID_STATUSES.join(', ')}.`,
      ],
    };
  }

  try {
    const result = await client.observe.list_deployments({
      project_id: options?.project_id,
      instance_id: options?.instance_id,
      workflow_id: options?.workflow_id,
      status: options?.status as DeploymentStatus | undefined,
      page: options?.page,
      page_size: options?.page_size,
    });
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to list deployments: ${message}`] };
  }
}

export async function runDeploymentsGetCommand(
  client: LoxtepClient,
  deployment_id: string,
  options?: { include_versions?: boolean }
): Promise<CliResult> {
  try {
    const result = await client.observe.get_deployment(deployment_id, {
      include_versions: options?.include_versions,
    });
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to get deployment: ${message}`] };
  }
}
