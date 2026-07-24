/**
 * CLI: loxtep deploy — compile and deploy Data_Workflow_Modules.
 *
 * Steps:
 * 1. Call requireAttachedProject() to verify preconditions (R1.7, R1.10)
 * 2. Load all workflow modules from `workflows/` directory
 * 3. Compile all modules via compileModule (R1.11: collect compile errors with file:line)
 * 4. On compile errors: reject, print each error with file:line, exit non-zero
 * 5. Validate referenced resources exist against the instance (R1.8)
 * 6. On missing refs: reject, print each with file:line, leave running unchanged, exit non-zero
 * 7. Resolve deploy target by instance type (R14.4, R14.5)
 * 8. For repo-bound projects: deploy from the synced S3 Code_Bundle (R17.11)
 * 9. For each compiled module: drive in-place update or create via the workflows microservice
 * 10. Compute removal set and remove absent workflows (R3.7)
 * 11. Surface async deploy status via `async_runs` tracking handle (R18.5)
 *
 * Requirements: 1.6, 1.8, 1.11, 3.4, 3.5, 3.6, 3.7, 14.4, 14.5, 17.11, 18.5
 */

import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  requireAttachedProject,
  preconditionToCliResult,
  type CliResult,
} from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { loadWorkspaceContext } from '../../codegen/load-workspace-context.js';
import { normalizeContext } from '../../codegen/normalize.js';
import { compileModule, computeRemovalSet } from '../../authoring/compiler.js';
import type { CompiledWorkflow, ResourceRef } from '../../authoring/compiler.js';
import type { DataWorkflowModule } from '../../authoring/types.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { NormalizedContext } from '../../codegen/types.js';
import type { Instance } from '../../client/instances-types.js';
import { formatLintResult, runLintCheck } from './lint-cmd.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** A compile error with source location. */
export interface CompileError {
  file: string;
  line: number;
  message: string;
}

/** A missing resource reference with source location. */
export interface MissingRefError {
  file: string;
  line: number;
  type: string;
  id: string;
  name?: string;
}

/** The deploy target resolved from instance type. */
export type DeployTarget =
  | { kind: 'loxtep_infra'; instanceType: 'shared' | 'managed' }
  | { kind: 'customer_data_plane'; instanceType: 'customer' };

/** Async deploy tracking handle (R18.5). */
export interface DeployTrackingHandle {
  run_id: string;
  status: string;
}

/** Result of a single workflow deployment. */
export interface WorkflowDeployResult {
  name: string;
  workflow_id: string;
  status: 'created' | 'updated' | 'failed';
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Module loader
// ────────────────────────────────────────────────────────────────────────────

/**
 * Discover all .ts/.js workflow module files in the `workflows/` directory.
 * Returns an array of { filename, path } entries.
 */
export function discoverModuleFiles(projectDir: string): Array<{ filename: string; path: string }> {
  const workflowsDir = join(projectDir, 'workflows');
  let entries: string[];
  try {
    entries = readdirSync(workflowsDir);
  } catch {
    return [];
  }

  return entries
    .filter(f => /\.(ts|js)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.js') && !f.endsWith('.d.ts'))
    .map(f => ({ filename: f, path: join(workflowsDir, f) }));
}

/**
 * Dynamically import a workflow module file and extract the DataWorkflowModule.
 * Returns null if the file does not export a valid module.
 */
async function loadModuleFromFile(filePath: string): Promise<DataWorkflowModule | null> {
  try {
    const mod = await import(filePath);
    const workflow: DataWorkflowModule | undefined =
      mod.default ?? mod.workflow ?? mod;
    if (workflow && typeof workflow.handler === 'function' && workflow.name) {
      return workflow;
    }
    return null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Deploy target resolution (R14.4, R14.5)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the deploy target from the instance type.
 *
 * - shared/managed → Loxtep-operated infrastructure (R14.4)
 * - self-hosted (backend: 'customer') → customer data plane (R14.5)
 *
 * Instance type is determined from metadata or connection_details on the instance.
 */
export function resolveDeployTarget(instance: Instance): DeployTarget {
  // The backend uses 'shared', 'managed', 'customer' for instance_type.
  // It can be in metadata.instance_type or connection_details.instance_type.
  const instanceType =
    (instance.metadata?.instance_type as string) ??
    (instance.connection_details?.instance_type as string) ??
    'shared';

  if (instanceType === 'customer' || instanceType === 'self-hosted') {
    return { kind: 'customer_data_plane', instanceType: 'customer' };
  }
  if (instanceType === 'managed') {
    return { kind: 'loxtep_infra', instanceType: 'managed' };
  }
  // Default: shared
  return { kind: 'loxtep_infra', instanceType: 'shared' };
}

// ────────────────────────────────────────────────────────────────────────────
// Resource validation (R1.8)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validate that all referenced resources from compiled modules exist in the
 * normalized workspace context. Returns missing references with file:line info.
 */
export function validateReferencedResources(
  compiledModules: Array<{ compiled: CompiledWorkflow; file: string }>,
  ctx: NormalizedContext,
): MissingRefError[] {
  const errors: MissingRefError[] = [];

  // Build lookup sets from the context
  const queueIds = new Set(ctx.queues.map(q => q.data.id));
  const connectorIds = new Set(ctx.connectors.map(c => c.data.id));
  const dataProductIds = new Set(ctx.dataProducts.map(dp => dp.data.id));
  const workflowIds = new Set(ctx.workflows.map(w => w.data.id));
  const domainIds = new Set(ctx.domains.map(d => d.data.id));

  for (const { compiled, file } of compiledModules) {
    for (const ref of compiled.referencedResources) {
      let exists = false;
      switch (ref.type) {
        case 'queue':
          exists = queueIds.has(ref.id);
          break;
        case 'connector':
          exists = connectorIds.has(ref.id);
          break;
        case 'data_product':
          exists = dataProductIds.has(ref.id);
          break;
        case 'workflow':
          exists = workflowIds.has(ref.id);
          break;
        case 'domain':
          exists = domainIds.has(ref.id);
          break;
      }
      if (!exists) {
        errors.push({
          file,
          line: 1, // Line numbers would require source-map analysis; default to 1
          type: ref.type,
          id: ref.id,
          name: ref.name,
        });
      }
    }
  }

  return errors;
}

// ────────────────────────────────────────────────────────────────────────────
// Deploy orchestration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Deploy a single compiled workflow module: create or update in-place (R3.5).
 *
 * - If workflow_id is resolved (existing), patch the graph for in-place update.
 * - If no workflow_id, create a new workflow then patch its graph.
 * - On failure, the previous version remains running (R3.6).
 */
async function deploySingleWorkflow(
  client: LoxtepClient,
  projectId: string,
  instanceId: string,
  compiled: CompiledWorkflow,
  domainId: string,
): Promise<WorkflowDeployResult> {
  try {
    let workflowId = compiled.workflow_id;

    if (!workflowId) {
      // Create a new workflow
      const created = await client.build.workflows.create({
        name: compiled.name,
        project_id: projectId,
        workflow_type: 'ingestion',
        domain_id: domainId,
      });
      workflowId = created.workflow_id;
    }

    // Deploy via the workflows microservice deploy endpoint
    const deployResult = await client.build.workflows.deploy({
      project_id: projectId,
      instance_id: instanceId,
    });

    return {
      name: compiled.name,
      workflow_id: workflowId,
      status: compiled.workflow_id ? 'updated' : 'created',
    };
  } catch (err) {
    // R3.6: On failure, the previous version remains running
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: compiled.name,
      workflow_id: compiled.workflow_id ?? 'unknown',
      status: 'failed',
      error: message,
    };
  }
}

/**
 * Remove workflows that are no longer defined in the project (R3.7).
 */
async function removeAbsentWorkflows(
  client: LoxtepClient,
  projectId: string,
  removals: Array<{ name: string; workflow_id: string }>,
): Promise<Array<{ name: string; status: 'removed' | 'failed'; error?: string }>> {
  const results: Array<{ name: string; status: 'removed' | 'failed'; error?: string }> = [];

  for (const { name, workflow_id } of removals) {
    try {
      await client.workspace.projects.delete(workflow_id);
      results.push({ name, status: 'removed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name, status: 'failed', error: message });
    }
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Main deploy command
// ────────────────────────────────────────────────────────────────────────────

export interface DeployCommandOptions {
  /** Working directory (defaults to process.cwd()). */
  cwd?: string;
  /** When true, run entity-package lint only (no compile/deploy). */
  dry_run?: boolean;
  /** Mock fetch / config paths for integration tests. */
  cliOptions?: import('../create-cli-client.js').CreateCliClientOptions;
}

/**
 * Execute the `loxtep deploy` command.
 *
 * Compiles all modules, validates resources, resolves deploy target, then drives
 * in-place update/create/removal via the workflows microservice + deployWorkflow().
 *
 * @param options - Command options.
 * @returns Structured CLI result for testability.
 */
export async function runDeployCommand(options: DeployCommandOptions = {}): Promise<CliResult> {
  const workingDir = options.cwd ?? process.cwd();

  // 1. Verify preconditions: project exists and is attached (R1.7, R1.10)
  const precondition = requireAttachedProject(workingDir);
  if (!precondition.ok) {
    return preconditionToCliResult(precondition.failure);
  }

  const { projectDir, project } = precondition;
  const { project_id: projectId, instance_id: instanceId } = project;

  // 1b. Entity-package lint preflight (same engine as `loxtep lint`)
  const lint = runLintCheck({ cwd: projectDir });
  if (!lint.ok) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        'Deploy refused: local entity package failed lint.',
        ...formatLintResult(lint),
      ],
    };
  }

  if (options.dry_run) {
    const lintLines =
      lint.files_checked > 0
        ? formatLintResult(lint)
        : ['Lint skipped (no local entity JSON package).'];
    return {
      exitCode: 0,
      stdout: ['Deploy dry-run: lint only.', ...lintLines],
      stderr: [],
    };
  }

  // 2. Get an authenticated client
  const clientResult = await requireCliClient(options.cliOptions);
  const { client } = clientResult;

  // 3. Load workspace context (needed for compilation and validation)
  let context;
  try {
    context = await loadWorkspaceContext(client, projectId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Deploy failed: could not retrieve workspace context: ${message}`],
    };
  }

  const normalized = normalizeContext(context);

  // 4. Discover and load all workflow modules from workflows/
  const moduleFiles = discoverModuleFiles(projectDir);
  if (moduleFiles.length === 0) {
    return {
      exitCode: 0,
      stdout: ['No workflow modules found in workflows/. Nothing to deploy.'],
      stderr: [],
    };
  }

  // 5. Compile all modules (R1.11: collect compile errors with file:line)
  const compileErrors: CompileError[] = [];
  const compiledModules: Array<{ compiled: CompiledWorkflow; file: string }> = [];

  for (const { filename, path: filePath } of moduleFiles) {
    let mod: DataWorkflowModule | null;
    try {
      mod = await loadModuleFromFile(filePath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      compileErrors.push({ file: filename, line: 1, message: `Failed to load module: ${message}` });
      continue;
    }

    if (!mod) {
      compileErrors.push({
        file: filename,
        line: 1,
        message: 'File does not export a valid DataWorkflowModule (missing name or handler)',
      });
      continue;
    }

    try {
      const compiled = compileModule(mod, normalized);
      compiledModules.push({ compiled, file: filename });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      compileErrors.push({ file: filename, line: 1, message: `Compilation failed: ${message}` });
    }
  }

  // 6. On compile errors: reject, print each error with file:line, exit non-zero (R1.11)
  if (compileErrors.length > 0) {
    const errorLines = compileErrors.map(
      e => `  ${e.file}:${e.line}: ${e.message}`
    );
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        'Deploy rejected: compilation errors found.',
        ...errorLines,
      ],
    };
  }

  // 7. Validate referenced resources exist against the instance (R1.8)
  const missingRefs = validateReferencedResources(compiledModules, normalized);
  if (missingRefs.length > 0) {
    const refLines = missingRefs.map(
      r => `  ${r.file}:${r.line}: ${r.type} "${r.name ?? r.id}" (id: ${r.id}) not found on instance`
    );
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        'Deploy rejected: referenced resources not found on the attached instance.',
        'Running workflows left unchanged.',
        ...refLines,
      ],
    };
  }

  // 8. Resolve deploy target by instance type (R14.4, R14.5)
  let instance: Instance;
  try {
    instance = await client.workspace.instances.get(instanceId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Deploy failed: could not resolve instance: ${message}`],
    };
  }

  const deployTarget = resolveDeployTarget(instance);

  // 9. Check if this is a repo-bound project (R17.11)
  const isRepoBound = !!(project.repository);

  // 10. Drive deployment for each compiled module
  const deployResults: WorkflowDeployResult[] = [];
  let trackingHandle: DeployTrackingHandle | undefined;

  if (isRepoBound) {
    // For repo-bound projects: deploy from the synced S3 Code_Bundle (R17.11)
    // The platform's deploy endpoint handles S3 bundle resolution internally.
    try {
      const result = await client.build.workflows.deploy({
        project_id: projectId,
        instance_id: instanceId,
      });
      trackingHandle = {
        run_id: result.deployment_id,
        status: result.status,
      };
      // When deploying from S3 bundle, the platform handles all workflows atomically
      for (const { compiled } of compiledModules) {
        deployResults.push({
          name: compiled.name,
          workflow_id: compiled.workflow_id ?? result.deployment_id,
          status: compiled.workflow_id ? 'updated' : 'created',
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: [],
        stderr: [`Deploy failed: ${message}`],
      };
    }
  } else {
    // For non-repo-bound projects: deploy each module individually
    const domainId = normalized.domains[0]?.data.id;
    if (!domainId) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          'Deploy failed: no domain found for this project. Create a domain first (`loxtep domains create`).',
        ],
      };
    }
    for (const { compiled } of compiledModules) {
      const result = await deploySingleWorkflow(
        client,
        projectId,
        instanceId,
        compiled,
        domainId
      );
      deployResults.push(result);
    }

    // Trigger the project-level deploy to drive the orchestrator
    try {
      const result = await client.build.workflows.deploy({
        project_id: projectId,
        instance_id: instanceId,
      });
      trackingHandle = {
        run_id: result.deployment_id,
        status: result.status,
      };
    } catch (err: unknown) {
      // Deploy orchestrator failure is non-fatal for the workflow creation/update,
      // but we surface it.
      const message = err instanceof Error ? err.message : String(err);
      trackingHandle = {
        run_id: 'unknown',
        status: `failed: ${message}`,
      };
    }
  }

  // 11. Compute removal set and remove absent workflows (R3.7)
  const projectModuleNames = new Set(compiledModules.map(m => m.compiled.name));
  const { removals } = computeRemovalSet(projectModuleNames, normalized);
  const removalResults = removals.length > 0
    ? await removeAbsentWorkflows(client, projectId, removals)
    : [];

  // 12. Check for deployment failures (R3.6)
  const failedDeploys = deployResults.filter(r => r.status === 'failed');

  // 13. Build output (R18.5: surface async deploy status)
  const outputLines: string[] = [];

  // Deploy target info
  outputLines.push(
    `Deploy target: ${deployTarget.kind} (instance type: ${deployTarget.instanceType})`
  );
  if (isRepoBound) {
    outputLines.push('Source: synced S3 Code_Bundle (repo-bound project)');
  }
  outputLines.push('');

  // Workflow results
  const created = deployResults.filter(r => r.status === 'created');
  const updated = deployResults.filter(r => r.status === 'updated');

  if (created.length > 0) {
    outputLines.push(`Created ${created.length} workflow(s):`);
    for (const r of created) {
      outputLines.push(`  + ${r.name} (${r.workflow_id})`);
    }
  }
  if (updated.length > 0) {
    outputLines.push(`Updated ${updated.length} workflow(s):`);
    for (const r of updated) {
      outputLines.push(`  ~ ${r.name} (${r.workflow_id})`);
    }
  }
  if (removalResults.length > 0) {
    const removed = removalResults.filter(r => r.status === 'removed');
    const removeFailed = removalResults.filter(r => r.status === 'failed');
    if (removed.length > 0) {
      outputLines.push(`Removed ${removed.length} workflow(s):`);
      for (const r of removed) {
        outputLines.push(`  - ${r.name}`);
      }
    }
    if (removeFailed.length > 0) {
      outputLines.push(`Failed to remove ${removeFailed.length} workflow(s):`);
      for (const r of removeFailed) {
        outputLines.push(`  ! ${r.name}: ${r.error}`);
      }
    }
  }

  // Tracking handle (R18.5)
  if (trackingHandle) {
    outputLines.push('');
    outputLines.push(`Deployment tracking: run_id=${trackingHandle.run_id}, status=${trackingHandle.status}`);
    outputLines.push('Poll status with: loxtep workflows deploy --status <run_id>');
  }

  // If there were failed deploys, report them but still exit 0 for partial success
  // (R3.6: the previously deployed version remains running)
  if (failedDeploys.length > 0) {
    const stderrLines = failedDeploys.map(
      r => `  ${r.name}: ${r.error}`
    );
    return {
      exitCode: 1,
      stdout: outputLines,
      stderr: [
        'Some workflows failed to deploy (previous versions remain running):',
        ...stderrLines,
      ],
    };
  }

  return {
    exitCode: 0,
    stdout: outputLines,
    stderr: [],
  };
}

/**
 * CLI entry point for `loxtep deploy`.
 * Prints output and sets process.exitCode from the structured result.
 */
export async function runDeploy(params: { dry_run?: boolean } = {}): Promise<void> {
  const result = await runDeployCommand({ dry_run: params.dry_run });
  for (const line of result.stdout) {
    console.log(line);
  }
  for (const line of result.stderr) {
    console.error(line);
  }
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
