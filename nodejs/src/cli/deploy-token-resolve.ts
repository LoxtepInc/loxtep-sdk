/**
 * Resolve CI deploy-token auth inputs for the CLI.
 *
 * Deploy-token auth is the headless-CI path and takes precedence over the
 * interactive (browser/console) credentials. It needs three things:
 *   - LOXTEP_DEPLOY_TOKEN  — the `lxdt_...` secret (required to engage this path)
 *   - the target project   — LOXTEP_PROJECT_ID env, or an explicit project id
 *                            (a `--project` flag wins over the env var)
 *   - LOXTEP_ACTOR / --actor — optional audit actor stamped on each exchange
 */

export interface DeployTokenInputs {
  deploy_token: string;
  project_id: string;
  actor?: string;
}

export interface ResolveDeployTokenOptions {
  /** From a `--project` flag; wins over LOXTEP_PROJECT_ID. */
  projectId?: string;
  /** From a `--actor` flag; wins over LOXTEP_ACTOR. */
  actor?: string;
  /** Workspace/config project_id fallback when neither flag nor env is set. */
  configProjectId?: string;
}

/**
 * Returns deploy-token inputs when LOXTEP_DEPLOY_TOKEN is set, otherwise null
 * (so the caller falls through to interactive credentials).
 *
 * Throws when a deploy token is present but no project can be resolved — CI must
 * name the project it is deploying to.
 */
export function resolveDeployTokenInputs(
  options?: ResolveDeployTokenOptions
): DeployTokenInputs | null {
  const deployToken = process.env.LOXTEP_DEPLOY_TOKEN?.trim();
  if (!deployToken) return null;

  const projectId =
    options?.projectId?.trim() ||
    process.env.LOXTEP_PROJECT_ID?.trim() ||
    options?.configProjectId?.trim() ||
    '';
  if (!projectId) {
    throw new Error(
      'LOXTEP_DEPLOY_TOKEN is set but no project was resolved. Pass --project <id>, ' +
        'set LOXTEP_PROJECT_ID, or attach a workspace with a project_id.'
    );
  }

  const actor = options?.actor?.trim() || process.env.LOXTEP_ACTOR?.trim() || undefined;

  return { deploy_token: deployToken, project_id: projectId, actor };
}
