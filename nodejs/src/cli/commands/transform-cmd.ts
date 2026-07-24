/**
 * CLI: loxtep transform create — enrichment workflow stub (upstream DP → consumer DP).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { findProjectDir } from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { formatLintResult, runLintCheck } from './lint-cmd.js';

export interface TransformCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  cwd?: string;
}

const ENRICHMENT_TEMPLATE_ID = '00000000-0000-4000-8000-0000000000a2';

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
 * Scaffold a local enrichment workflow: upstream data product → new consumer DP.
 * Transform DSL is a stub (identity) for day one.
 */
export async function runTransformCreate(
  params: {
    from: string;
    name?: string;
    project_id?: string;
    domain_id?: string;
    dry_run?: boolean;
  },
  options: TransformCmdOptions = {}
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
    console.error('Usage: loxtep transform create --from <upstream-dp-name> [--name cleaned-…]');
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

  const consumerName = params.name ?? `${params.from}-cleaned`;
  const workflowId = randomUUID();
  const connectionId = randomUUID();
  const dataProductId = randomUUID();
  const now = new Date().toISOString();

  const files: Record<string, Record<string, unknown>> = {
    [`workflows/${workflowId}/workflow.json`]: {
      workflow_id: workflowId,
      organization_id: organizationId,
      project_id: projectId,
      name: `Transform ${consumerName}`,
      template_id: ENRICHMENT_TEMPLATE_ID,
      workflow_type: 'enrichment',
      domain_id: domainId,
      status: 'active',
      configuration: {},
      metadata: { stage: 'transform', upstream_data_product: params.from },
      created_at: now,
      updated_at: now,
    },
    [`workflows/${workflowId}/connections/${connectionId}.json`]: {
      connection_id: connectionId,
      organization_id: organizationId,
      project_id: projectId,
      workflow_id: workflowId,
      key: 'data-product-trigger',
      name: `From ${params.from}`,
      type: 'data_product_trigger',
      status: 'active',
      configuration: {
        source_data_product_name: params.from,
      },
      created_at: now,
      updated_at: now,
    },
    [`workflows/${workflowId}/data-products/${dataProductId}.json`]: {
      data_product_id: dataProductId,
      organization_id: organizationId,
      workflow_id: workflowId,
      upstream_entity_id: connectionId,
      upstream_entity_type: 'connections',
      domain_id: domainId,
      name: consumerName,
      status: 'draft',
      governance: {
        classification: 'internal',
        pii_fields: [],
        compliance_requirements: [],
        tags: [],
      },
      metadata: {
        kind: 'consumer',
        project_id: projectId,
        upstream_data_product: params.from,
      },
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
          data_product_id: dataProductId,
          data_product_name: consumerName,
          workflow_type: 'enrichment',
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
        data_product_id: dataProductId,
        data_product_name: consumerName,
        workflow_type: 'enrichment',
        files: written,
      },
      null,
      2
    )
  );
  console.error(`
Transform package ready for "${consumerName}".
Next: \`loxtep delivery create --from ${consumerName} --connector-id …\` then \`loxtep push\` / \`loxtep deploy\`.
`);
}
