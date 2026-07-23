/**
 * CLI: loxtep generate — wire the codegen pipeline + skill validation.
 *
 * Steps:
 * 1. Call requireAttachedProject() to verify preconditions (R1.7, R1.10)
 * 2. Load workspace context via loadWorkspaceContext(client, projectId) (R1.4)
 * 3. Normalize with normalizeContext(ctx) (R2.5, R2.6)
 * 4. Validate skills against workspace context (R5.8, R5.9)
 * 5. Emit artifact with emitArtifact(norm) (R2.1–R2.5)
 * 6. Write with writeArtifact(path, source, norm) returning counts (R2.7)
 * 7. Print per-type counts (R2.7)
 * 8. On context-retrieval failure, exit non-zero and leave prior artifact unchanged (R2.8)
 *
 * Requirements: 1.4, 2.7, 2.8, 5.8, 5.9
 */

import { join } from 'node:path';
import {
  requireAttachedProject,
  preconditionToCliResult,
  type CliResult,
} from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { loadWorkspaceContext } from '../../codegen/load-workspace-context.js';
import { normalizeContext } from '../../codegen/normalize.js';
import { emitArtifact } from '../../codegen/emit.js';
import { writeArtifact } from '../../codegen/write-artifact.js';
import {
  loadSkillsFromDirectory,
  validateSkillReferences,
  formatSkillValidationErrors,
} from '../../skills/index.js';

/** Default path for the generated artifact relative to the project directory. */
const GENERATED_ARTIFACT_PATH = '.loxtep/generated/index.ts';
/** Skills directory relative to the project directory. */
const SKILLS_DIR = '.loxtep/skills';

export interface GenerateCommandOptions {
  /** Working directory to resolve the project from (defaults to process.cwd()). */
  cwd?: string;
  /** Mock fetch / config paths for integration tests. */
  cliOptions?: import('../create-cli-client.js').CreateCliClientOptions;
}

/**
 * Execute the `loxtep generate` command.
 *
 * Orchestrates the full codegen pipeline:
 * load → normalize → validate skills → emit → write → print counts.
 *
 * On context-retrieval failure, exits non-zero and leaves the prior artifact
 * unchanged (R2.8). On skill validation failure, exits non-zero (R5.9).
 *
 * @param cwd - Working directory to resolve the project from (defaults to process.cwd())
 * @returns Structured CLI result for testability
 */
export async function runGenerateCommand(
  cwdOrOptions?: string | GenerateCommandOptions
): Promise<CliResult> {
  const options: GenerateCommandOptions =
    typeof cwdOrOptions === 'string' ? { cwd: cwdOrOptions } : cwdOrOptions ?? {};
  const workingDir = options.cwd ?? process.cwd();

  // 1. Verify preconditions: project exists and is attached (R1.7, R1.10)
  const precondition = requireAttachedProject(workingDir);
  if (!precondition.ok) {
    return preconditionToCliResult(precondition.failure);
  }

  const { projectDir, project } = precondition;
  const { project_id: projectId } = project;

  // 2. Get an authenticated client
  const clientResult = await requireCliClient(options.cliOptions);
  const { client } = clientResult;

  // 3. Load workspace context from the platform (R1.4, R2.8)
  let context;
  try {
    context = await loadWorkspaceContext(client, projectId);
  } catch (err: unknown) {
    // R2.8: On context-retrieval failure, exit non-zero, leave prior artifact unchanged
    const message =
      err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Failed to retrieve workspace context: ${message}`],
    };
  }

  // 4. Normalize context (pure — deterministic key derivation + canonical ordering)
  const normalized = normalizeContext(context);

  // 5. Validate skills against workspace context (R5.8, R5.9)
  const skillsDir = join(projectDir, SKILLS_DIR);
  const skills = loadSkillsFromDirectory(skillsDir);

  if (skills.size > 0) {
    const validationResult = validateSkillReferences(skills, context);
    if (!validationResult.valid) {
      // R5.9: Exit non-zero with skill name and missing resource identifiers
      const errorMessages = formatSkillValidationErrors(validationResult.errors);
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          'Skill validation failed:',
          errorMessages,
        ],
      };
    }
  }

  // 6. Emit the typed TypeScript artifact (pure)
  const source = emitArtifact(normalized);

  // 7. Write atomically — on failure, prior artifact remains unchanged (R2.8)
  const artifactPath = join(projectDir, GENERATED_ARTIFACT_PATH);
  let counts;
  try {
    counts = await writeArtifact(artifactPath, source, normalized);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Failed to write generated artifact: ${message}`],
    };
  }

  // 8. Print per-type counts (R2.7)
  const countLines = [
    `Generated ${artifactPath}:`,
    `  Data products: ${counts.dataProducts}`,
    `  Connectors:    ${counts.connectors}`,
    `  Domains:       ${counts.domains}`,
    `  Queues:        ${counts.queues}`,
    `  Flows:         ${counts.flows}`,
    `  Workflows:     ${counts.workflows}`,
  ];

  return {
    exitCode: 0,
    stdout: countLines,
    stderr: [],
  };
}

/**
 * CLI entry point for `loxtep generate`.
 * Prints output and sets process.exitCode from the structured result.
 */
export async function runGenerate(): Promise<void> {
  const result = await runGenerateCommand();
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
