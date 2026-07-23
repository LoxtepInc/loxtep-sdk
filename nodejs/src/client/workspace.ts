/**
 * Workspace facade (MCP: loxtep_projects + loxtep_instances + loxtep_workspace versions).
 * Delegates to projects and instances APIs. Version/snapshot REST is not yet available.
 */

import type { createProjectsApi } from './projects.js';
import type { createInstancesApi } from './instances.js';

export interface WorkspaceFacadeDeps {
  projects: ReturnType<typeof createProjectsApi>;
  instances: ReturnType<typeof createInstancesApi>;
}

/** Placeholder until version/snapshot REST endpoints ship (MCP-only today). */
export interface VersionsFacade {
  /** Not yet available over REST — use MCP list_versions / create_snapshot. */
  readonly unavailable: true;
}

export function createWorkspaceFacade(deps: WorkspaceFacadeDeps): {
  projects: WorkspaceFacadeDeps['projects'];
  instances: WorkspaceFacadeDeps['instances'];
  versions: VersionsFacade;
} {
  return {
    projects: deps.projects,
    instances: deps.instances,
    versions: { unavailable: true },
  };
}

export type WorkspaceFacade = ReturnType<typeof createWorkspaceFacade>;
