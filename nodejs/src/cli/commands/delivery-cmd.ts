/**
 * CLI: loxtep delivery create — delivery workflow (DP → target connection + connector).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { findProjectDir } from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { formatLintResult, runLintCheck } from './lint-cmd.js';

export interface DeliveryCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  cwd?: string;
}

const DELIVERY_TEMPLATE_ID = '00000000-0000-4000-8000-0000000000a3';

function writePackageFiles(
  projectDir: string,
  files: Record<string, Record<string, unknown>>
): string[] {
  const written: string[] = [];
  for (const [relPath, entity] of Object.entries(files)) {
    const full = join(projectDir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `${JSON.stringify(entity, null, 2)}\n`);
    written.push(relPath);
  }
  return written;
}

/**
 * Scaffold a local delivery workflow: upstream DP → target connection (connector_id).
 * workflow_type is always `delivery` (never consumption).
 */
export async function runDeliveryCreate(
  params: {
    from: string;
    connector_id: string;
    name?: string;
    project_id?: string;
    domain_id?: string;
    dry_run?: boolean;
  },
  options: DeliveryCmdOptions = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectDir = findProjectDir(cwd) ?? cwd;
  const { client, config } = await requireCliClient(options);

  const projectId = params.project_id ?? config.project_id;
  if (!projectId) {
    console.error('Missing project_id. Run `loxtep init` and attach a project first.');
    process.exitCode = 1;
    return;
  }
  if (!params.from?.trim()) {
    console.error(
      'Usage: loxtep delivery create --from <dp-name> --connector-id <id> [--name …]'
    );
    process.exitCode = 1;
    return;
  }
  if (!params.connector_id?.trim()) {
    console.error('Missing --connector-id (target connector at the delivery tail).');
    process.exitCode = 1;
    return;
  }

  const user = await client.session.get_current_user();
  const organizationId = user.organization_id ?? client.organization_id;
  if (!organizationId) {
    console.error('Missing organization_id in session.');
    process.exitCode = 1;
    return;
  }

  // Verify connector exists
  await client.connect.connectors.get(params.connector_id);

  let domainId = params.domain_id;
  if (!domainId) {
    const domains = await client.define.domains.list({ page_size: 1 });
    domainId = domains.items?.[0]?.domain_id;
  }
  if (!domainId) {
    console.error('Missing domain_id. Pass --domain-id or create a domain first.');
    process.exitCode = 1;
    return;
  }

  const workflowName = params.name ?? `${params.from}-delivery`;
  const workflowId = randomUUID();
  const triggerConnectionId = randomUUID();
  const targetConnectionId = randomUUID();
  const now = new Date().toISOString();

  const files: Record<string, Record<string, unknown>> = {
    [`workflows/${workflowId}/workflow.json`]: {
      workflow_id: workflowId,
      organization_id: organizationId,
      project_id: projectId,
      name: workflowName,
      template_id: DELIVERY_TEMPLATE_ID,
      workflow_type: 'delivery',
      domain_id: domainId,
      status: 'active',
      configuration: {},
      metadata: { stage: 'delivery', upstream_data_product: params.from },
      created_at: now,
      updated_at: now,
    },
    [`workflows/${workflowId}/connections/${triggerConnectionId}.json`]: {
      connection_id: triggerConnectionId,
      organization_id: organizationId,
      project_id: projectId,
      workflow_id: workflowId,
      key: 'data-product-source',
      name: `From ${params.from}`,
      type: 'data_product_trigger',
      status: 'active',
      configuration: {
        source_data_product_name: params.from,
      },
      created_at: now,
      updated_at: now,
    },
    [`workflows/${workflowId}/connections/${targetConnectionId}.json`]: {
      connection_id: targetConnectionId,
      organization_id: organizationId,
      project_id: projectId,
      workflow_id: workflowId,
      connector_id: params.connector_id,
      key: 'delivery-target',
      name: 'Delivery Target',
      type: 'webhook',
      status: 'active',
      configuration: {
        direction: 'outbound',
        role: 'target',
      },
      upstream_entity_id: triggerConnectionId,
      upstream_entity_type: 'connections',
      created_at: now,
      updated_at: now,
    },
  };

  if (params.dry_run) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          workflow_id: workflowId,
          workflow_type: 'delivery',
          connector_id: params.connector_id,
          target_connection_id: targetConnectionId,
          files: Object.keys(files),
        },
        null,
        2
      )
    );
    return;
  }

  const written = writePackageFiles(projectDir, files);
  const lint = runLintCheck({ cwd: projectDir, workflow_id: workflowId });
  if (!lint.ok) {
    for (const line of formatLintResult(lint)) {
      console.error(line);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        workflow_id: workflowId,
        workflow_type: 'delivery',
        connector_id: params.connector_id,
        target_connection_id: targetConnectionId,
        files: written,
      },
      null,
      2
    )
  );
  console.error(`
Delivery package ready (workflow_type: delivery).
Next: \`loxtep lint\` → \`loxtep push\` → \`loxtep deploy\`.
`);
}
