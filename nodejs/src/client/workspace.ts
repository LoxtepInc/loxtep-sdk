/**
 * Workspace facade (MCP: loxtep_workspace).
 * Delegates to projects, instances, and deployments APIs.
 * Version/snapshot REST is not yet available.
 */

import type { createProjectsApi } from './projects.js';
import type { createInstancesApi } from './instances.js';
import type { createDeploymentsApi } from './deployments.js';

export interface WorkspaceFacadeDeps {
  projects: ReturnType<typeof createProjectsApi>;
  instances: ReturnType<typeof createInstancesApi>;
  deployments: ReturnType<typeof createDeploymentsApi>;
}

/** Placeholder until version/snapshot REST endpoints ship (MCP-only today). */
export interface VersionsFacade {
  /** Not yet available over REST — use MCP list_versions / create_snapshot. */
  readonly unavailable: true;
}

export function createWorkspaceFacade(deps: WorkspaceFacadeDeps): {
  projects: WorkspaceFacadeDeps['projects'];
  instances: WorkspaceFacadeDeps['instances'];
  deployments: WorkspaceFacadeDeps['deployments'];
  versions: VersionsFacade;
} {
  return {
    projects: deps.projects,
    instances: deps.instances,
    deployments: deps.deployments,
    versions: { unavailable: true },
  };
}

export type WorkspaceFacade = ReturnType<typeof createWorkspaceFacade>;
