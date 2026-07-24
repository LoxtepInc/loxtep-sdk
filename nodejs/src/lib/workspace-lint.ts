/**
 * Offline lint of a local Loxtep project package (entity schemas + relationships).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EntityType, validateEntity } from './entity-json-schemas/index.js';

export interface LintIssue {
  path: string;
  severity: 'error';
  message: string;
}

export interface LintResult {
  ok: boolean;
  issues: LintIssue[];
  files_checked: number;
}

export interface LintOptions {
  /** Project root (contains workflows/, connectors/). */
  projectDir: string;
  /** When set, only lint this workflow directory under workflows/<id>/. */
  workflow_id?: string;
}

interface DiscoveredEntity {
  path: string;
  entityType: (typeof EntityType)[keyof typeof EntityType];
  data: Record<string, unknown>;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...listJsonFiles(full));
    } else if (name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

function classifyEntity(
  projectDir: string,
  filePath: string
): (typeof EntityType)[keyof typeof EntityType] | null {
  const rel = relative(projectDir, filePath).replace(/\\/g, '/');
  if (rel.startsWith('connectors/') && rel.endsWith('.json')) {
    return EntityType.CONNECTOR;
  }
  if (rel.match(/^workflows\/[^/]+\/workflow\.json$/)) {
    return EntityType.WORKFLOW;
  }
  if (rel.match(/^workflows\/[^/]+\/connections\/[^/]+\.json$/)) {
    return EntityType.CONNECTION;
  }
  if (rel.match(/^workflows\/[^/]+\/data-products\/[^/]+\.json$/)) {
    return EntityType.DATA_PRODUCT;
  }
  if (rel.match(/^workflows\/[^/]+\/transformations\/[^/]+\.json$/)) {
    return EntityType.TRANSFORMATION;
  }
  if (rel.match(/^workflows\/[^/]+\/validations\/[^/]+\.json$/)) {
    return EntityType.VALIDATION;
  }
  if (rel.startsWith('domains/') && rel.endsWith('.json')) {
    return EntityType.DOMAIN;
  }
  return null;
}

function discoverEntities(projectDir: string, workflowId?: string): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];
  const roots: string[] = [join(projectDir, 'connectors'), join(projectDir, 'domains')];

  if (workflowId) {
    roots.push(join(projectDir, 'workflows', workflowId));
  } else {
    roots.push(join(projectDir, 'workflows'));
  }

  for (const root of roots) {
    for (const filePath of listJsonFiles(root)) {
      const entityType = classifyEntity(projectDir, filePath);
      if (!entityType) continue;
      const data = readJsonObject(filePath);
      const rel = relative(projectDir, filePath).replace(/\\/g, '/');
      if (!data) {
        entities.push({
          path: rel,
          entityType,
          data: {},
        });
        // mark unreadable via empty + special handling below
        continue;
      }
      entities.push({ path: rel, entityType, data });
    }
  }

  return entities;
}

/**
 * Lint local entity JSON against shipped schemas and basic relationship checks.
 */
export function lintLocalPackage(options: LintOptions): LintResult {
  const { projectDir, workflow_id } = options;
  const issues: LintIssue[] = [];

  if (!existsSync(projectDir)) {
    return {
      ok: false,
      files_checked: 0,
      issues: [{ path: projectDir, severity: 'error', message: 'Project directory not found' }],
    };
  }

  const entities = discoverEntities(projectDir, workflow_id);
  const byId = new Map<string, DiscoveredEntity>();

  for (const entity of entities) {
    if (Object.keys(entity.data).length === 0) {
      issues.push({
        path: entity.path,
        severity: 'error',
        message: 'Invalid or unreadable JSON object',
      });
      continue;
    }

    const result = validateEntity(entity.entityType, entity.data);
    if (!result.valid && result.errors) {
      for (const err of result.errors) {
        issues.push({
          path: `${entity.path}${err.path}`,
          severity: 'error',
          message: err.message,
        });
      }
    }

    const idKey =
      (entity.data.connector_id as string | undefined) ||
      (entity.data.connection_id as string | undefined) ||
      (entity.data.workflow_id as string | undefined) ||
      (entity.data.data_product_id as string | undefined) ||
      (entity.data.domain_id as string | undefined);
    if (idKey) {
      byId.set(idKey, entity);
    }
  }

  // Relationship checks
  for (const entity of entities) {
    if (entity.entityType === EntityType.CONNECTION) {
      const connectorId = entity.data.connector_id;
      if (typeof connectorId === 'string' && connectorId.length > 0) {
        // connector may exist only remotely; warn only if local connectors/ is present
        // and does not contain this id — keep as error when local connector file expected.
        const localConnectors = entities.filter(e => e.entityType === EntityType.CONNECTOR);
        if (
          localConnectors.length > 0 &&
          !localConnectors.some(c => c.data.connector_id === connectorId)
        ) {
          issues.push({
            path: entity.path,
            severity: 'error',
            message: `connector_id "${connectorId}" not found under connectors/`,
          });
        }
      } else {
        issues.push({
          path: entity.path,
          severity: 'error',
          message: 'connection is missing connector_id',
        });
      }
    }

    if (entity.entityType === EntityType.DATA_PRODUCT) {
      const upstream = entity.data.upstream_entity_id;
      if (typeof upstream === 'string' && upstream.length > 0 && !byId.has(upstream)) {
        // Upstream may be a connection in the same workflow — check connection ids
        const conn = entities.find(
          e =>
            e.entityType === EntityType.CONNECTION && e.data.connection_id === upstream
        );
        if (!conn) {
          issues.push({
            path: entity.path,
            severity: 'error',
            message: `upstream_entity_id "${upstream}" not found in local package`,
          });
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    files_checked: entities.length,
  };
}

/**
 * True when the project has at least one entity JSON package file to lint.
 */
export function hasLocalEntityPackage(projectDir: string): boolean {
  const workflowsDir = join(projectDir, 'workflows');
  if (!existsSync(workflowsDir)) return false;
  for (const name of readdirSync(workflowsDir)) {
    const wfJson = join(workflowsDir, name, 'workflow.json');
    if (existsSync(wfJson)) return true;
  }
  return existsSync(join(projectDir, 'connectors')) && listJsonFiles(join(projectDir, 'connectors')).length > 0;
}
