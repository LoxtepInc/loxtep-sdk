/**
 * CLI: loxtep delivery create — delivery workflow from the connector-delivery
 * project template: data product → transform → outbound connection.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { findProjectDir } from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { formatLintResult, runLintCheck } from './lint-cmd.js';
import { toLocalConnectorEntity } from '../../lib/sdk-ingest-bundle.js';

export interface DeliveryCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  cwd?: string;
}

/** Stable template id for connector-delivery (loxtep-project-template). */
export const DELIVERY_TEMPLATE_ID = '00000000-0000-4000-8000-0000000000a3';
export const DELIVERY_TEMPLATE_SLUG = 'connector-delivery';

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
 * Scaffold a local delivery workflow from the connector-delivery template:
 * upstream DP trigger → transform → outbound target connection (connector_id).
 * workflow_type is always `delivery` (never consumption).
 *
 * Write policy (table, batch sizes, conflict_update) lives on the target
 * connection. Auth/transport live on the org connector.
 */
export async function runDeliveryCreate(
  params: {
    from: string;
    connector_id: string;
    name?: string;
    project_id?: string;
    domain_id?: string;
    /** Destination table (e.g. accounts.accounts). Stored on the outbound connection. */
    table?: string;
    schema?: string;
    primary_key?: string;
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
      'Usage: loxtep delivery create --from <dp-name> --connector-id <id> [--table schema.table] [--name …]'
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

  // Verify connector exists and mirror it under connectors/ for workspace lint.
  const connector = await client.connect.connectors.get(params.connector_id);
  const localConnectorPath = join(projectDir, 'connectors', `${connector.connector_id}.json`);
  const includeConnectorFile = !existsSync(localConnectorPath);
  const connectionType =
    (typeof connector.connector_type === 'string' && connector.connector_type.trim()) ||
    'webhook';

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
  const transformId = randomUUID();
  const targetConnectionId = randomUUID();
  const now = new Date().toISOString();

  const table = params.table?.trim() || '';
  const schema = params.schema?.trim() || 'public';
  const primaryKey = params.primary_key?.trim() || '_id';

  const files: Record<string, Record<string, unknown>> = {};
  if (includeConnectorFile) {
    files[`connectors/${connector.connector_id}.json`] = toLocalConnectorEntity(connector, now);
  }

  files[`workflows/${workflowId}/workflow.json`] = {
    workflow_id: workflowId,
    organization_id: organizationId,
    project_id: projectId,
    name: workflowName,
    description: `Delivery workflow: ${params.from} → ${connectionType} target`,
    template_id: DELIVERY_TEMPLATE_ID,
    workflow_type: 'delivery',
    domain_id: domainId,
    status: 'active',
    configuration: {
      activation: 'event',
    },
    metadata: {
      stage: 'delivery',
      template_slug: DELIVERY_TEMPLATE_SLUG,
      upstream_data_product: params.from,
      transform_id: transformId,
    },
    created_at: now,
    updated_at: now,
  };

  files[`workflows/${workflowId}/connections/${triggerConnectionId}.json`] = {
    connection_id: triggerConnectionId,
    organization_id: organizationId,
    project_id: projectId,
    workflow_id: workflowId,
    key: 'data-product-source',
    name: `From ${params.from}`,
    type: 'data-product-trigger',
    connector_type: 'data-product-trigger',
    status: 'active',
    configuration: {
      source_data_product_name: params.from,
    },
    metadata: {
      template_slug: DELIVERY_TEMPLATE_SLUG,
      role: 'source',
    },
    created_at: now,
    updated_at: now,
  };

  files[`workflows/${workflowId}/transformations/${transformId}.json`] = {
    transformation_id: transformId,
    organization_id: organizationId,
    project_id: projectId,
    workflow_id: workflowId,
    name: 'Map to destination columns',
    transform_type: 'select_fields',
    operation_config: {
      fields: [],
    },
    upstream_entity_id: triggerConnectionId,
    upstream_entity_type: 'connections',
    metadata: {
      template_slug: DELIVERY_TEMPLATE_SLUG,
      notes:
        'Author field→column mapping here. Outbound bot expects a flat destination-shaped row.',
    },
    created_at: now,
    updated_at: now,
  };

  const targetConfiguration: Record<string, unknown> = {
    direction: 'outbound',
    role: 'target',
    write_mode: 'upsert',
    primary_key: [primaryKey],
    batch_size: 100,
    insert_batch_size: 1000,
    conflict_update: { default: 'excluded' },
  };
  if (table) {
    targetConfiguration.table = table;
    targetConfiguration.schema = schema;
  }

  files[`workflows/${workflowId}/connections/${targetConnectionId}.json`] = {
    connection_id: targetConnectionId,
    organization_id: organizationId,
    project_id: projectId,
    workflow_id: workflowId,
    connector_id: params.connector_id,
    key: 'delivery-target',
    name: 'Delivery Target',
    type: connectionType,
    connector_type: connectionType,
    status: 'active',
    connector_mode: 'outbound',
    configuration: targetConfiguration,
    upstream_entity_id: transformId,
    upstream_entity_type: 'transformations',
    metadata: {
      template_slug: DELIVERY_TEMPLATE_SLUG,
      role: 'target',
      notes:
        'Auth/transport come from the org connector. Write policy (table, batch sizes, conflict_update) lives on this connection. List tables via `loxtep connectors list-entities <connector_id>`.',
    },
    created_at: now,
    updated_at: now,
  };

  if (params.dry_run) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          workflow_id: workflowId,
          workflow_type: 'delivery',
          template_slug: DELIVERY_TEMPLATE_SLUG,
          connector_id: params.connector_id,
          transform_id: transformId,
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
        template_slug: DELIVERY_TEMPLATE_SLUG,
        connector_id: params.connector_id,
        transform_id: transformId,
        target_connection_id: targetConnectionId,
        files: written,
      },
      null,
      2
    )
  );
  console.error(`
Delivery package ready (workflow_type: delivery, template: ${DELIVERY_TEMPLATE_SLUG}).
Graph: data-product-trigger → transform → outbound connection.
Next: author transform mapping + set connection.configuration.table (list via \`loxtep connectors list-entities\`), then \`loxtep lint\` → \`loxtep push\` → \`loxtep deploy\`.
`);
}
