/**
 * Project versions (snapshots) API types.
 * Backend: No dedicated REST API yet. MCP tools (list_versions, create_snapshot,
 * restore_version, compare_versions) use CustomerWorkspaceService internally.
 * SDK module exposes types for when REST endpoints are added.
 * See: platform-backend/pipelines/lib/project-versions.ts
 */

export interface ProjectVersionMetadata {
  version_id: string;
  project_id: string;
  organization_id: string;
  description?: string;
  created_at: string;
  created_by: string;
  snapshot_type: 'manual' | 'auto';
  file_count: number;
  entity_count: number;
}

export interface VersionDiff {
  version_a: string;
  version_b: string;
  added: Array<{ path: string; new_content: unknown }>;
  deleted: Array<{ path: string; old_content: unknown }>;
  modified: Array<{
    path: string;
    old_content: unknown;
    new_content: unknown;
    changes: Array<{ path: string; old_value: unknown; new_value: unknown }>;
  }>;
  summary: { added: number; deleted: number; modified: number; total: number };
}
