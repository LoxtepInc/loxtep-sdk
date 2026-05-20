/**
 * Project versions (snapshots) module.
 *
 * NOTE: Project version/snapshot operations are currently available only via
 * MCP tools (list_versions, create_snapshot, restore_version, compare_versions)
 * which call CustomerWorkspaceService. There is no REST API for these operations yet.
 *
 * This module exports the types for future SDK use when REST endpoints are added.
 * Use the MCP tools or POST /ai/mcp/tools/call for now.
 *
 * See: docs/customer-facing-mcp-and-ai-tools.md (Versions and snapshots section)
 */

export type { ProjectVersionMetadata, VersionDiff } from './versions-types.js';
