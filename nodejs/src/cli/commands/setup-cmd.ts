/**
 * `loxtep setup` — idempotent sample resource provisioning for bundled templates.
 *
 * For `shopify-orders`:
 *   1. Require attached project + stream-config
 *   2. Ensure a domain exists (list; do not invent one — UI if empty)
 *   3. Ensure `orders_raw` and `orders_enriched` data products exist via
 *      `ingest create --deploy` when missing
 *   4. Print next steps (generate → test → deploy)
 *
 * Repeat runs are safe: existing DPs are reused.
 */

import {
  requireAttachedStreamConfig,
  preconditionToCliResult,
  type CliResult,
} from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { runIngestCreate } from './ingest-cmd.js';
import type { CreateCliClientOptions } from '../create-cli-client.js';

const SHOPIFY_ORDERS_PRODUCTS = ['orders_raw', 'orders_enriched'] as const;

export interface SetupCommandOptions {
  cwd?: string;
  /** Override template slug (default: project.json template_slug or shopify-orders). */
  templateSlug?: string;
  cliOptions?: CreateCliClientOptions;
  /**
   * Injectable ingest create (tests). When omitted, uses real runIngestCreate.
   */
  runIngest?: typeof runIngestCreate;
}

async function dataProductExists(
  listNames: () => Promise<string[]>,
  name: string
): Promise<boolean> {
  const names = await listNames();
  return names.some((n) => n === name);
}

/**
 * Provision sample resources for a known bundled template.
 */
export async function runSetupCommand(options: SetupCommandOptions = {}): Promise<CliResult> {
  const workingDir = options.cwd ?? process.cwd();
  const stdout: string[] = [];
  const stderr: string[] = [];

  const precondition = requireAttachedStreamConfig(workingDir);
  if (!precondition.ok) {
    return preconditionToCliResult(precondition.failure);
  }

  const { project, projectDir } = precondition;
  const templateSlug =
    options.templateSlug ?? project.template_slug ?? 'shopify-orders';

  if (templateSlug !== 'shopify-orders') {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `loxtep setup currently supports the shopify-orders template (got "${templateSlug}").`,
        'Re-init with: loxtep init --template shopify-orders',
      ],
    };
  }

  const clientResult = await requireCliClient(options.cliOptions);
  const { client } = clientResult;

  // Domain required by ingest create
  const domains = await client.define.domains.list({ page_size: 20 });
  const domain = domains.items?.[0];
  if (!domain) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        'No domains found in this organization.',
        'Create one in the Web UI (Governance → Domains), then re-run `loxtep setup`.',
      ],
    };
  }
  stdout.push(`Using domain: ${domain.name} (${domain.domain_id})`);

  const listDpNames = async (): Promise<string[]> => {
    const listed = await client.build.data_products.list({ page_size: 100 });
    return (listed.items ?? []).map((dp) => dp.name);
  };

  const ingest = options.runIngest ?? runIngestCreate;
  const created: string[] = [];
  const reused: string[] = [];

  for (const name of SHOPIFY_ORDERS_PRODUCTS) {
    if (await dataProductExists(listDpNames, name)) {
      reused.push(name);
      stdout.push(`✓ Data product already exists: ${name}`);
      continue;
    }

    stdout.push(`Provisioning data product "${name}" (ingest create --deploy)…`);
    const prevExit = process.exitCode;
    process.exitCode = 0;
    try {
      await ingest(
        {
          name,
          domain_id: domain.domain_id,
          project_id: project.project_id,
          instance_id: project.instance_id,
          deploy: true,
          workflow_name: `${name}-ingest`,
        },
        {
          ...options.cliOptions,
          cwd: projectDir,
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stderr.push(`Failed to provision "${name}": ${message}`);
      return { exitCode: 1, stdout, stderr };
    }

    if (process.exitCode && process.exitCode !== 0) {
      stderr.push(`Failed to provision "${name}" (ingest exited ${process.exitCode}).`);
      process.exitCode = prevExit ?? 0;
      return { exitCode: 1, stdout, stderr };
    }
    process.exitCode = prevExit ?? 0;
    created.push(name);
    stdout.push(`✓ Created and deployed: ${name}`);
  }

  stdout.push('');
  stdout.push(
    `Setup complete for shopify-orders (created: ${created.length || 'none'}, reused: ${reused.length || 'none'}).`
  );
  stdout.push('Next:');
  stdout.push('  1. loxtep generate');
  stdout.push('  2. loxtep test orders-enricher --event ./events/order-created.json');
  stdout.push('     (approve dataProducts.write when prompted — live instance write)');
  stdout.push('  3. loxtep deploy');
  stdout.push('');
  stdout.push(
    'Note: test runs the handler locally with live instance I/O (not an offline simulation).'
  );

  return { exitCode: 0, stdout, stderr };
}

export async function runSetup(): Promise<void> {
  const args = process.argv.slice(2);
  const templateIdx = args.indexOf('--template');
  const templateSlug = templateIdx >= 0 ? args[templateIdx + 1] : undefined;
  const result = await runSetupCommand({ templateSlug });
  for (const line of result.stdout) console.log(line);
  for (const line of result.stderr) console.error(line);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
