/**
 * Offline lint of a local Loxtep project package (entity schemas + relationships +
 * project-scoped workflow/data-product name uniqueness).
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

/**
 * Canonical trigger type used by templates, backend validation, and runtime.
 * Only the hyphenated spelling is accepted.
 */
export const DATA_PRODUCT_TRIGGER_TYPE = 'data-product-trigger' as const;

/** Rejected legacy spelling — lint fails with a rename message. */
export const DATA_PRODUCT_TRIGGER_TYPE_LEGACY = 'data_product_trigger' as const;

/** Entity-type-specific primary ID fields (mirrors platform ENTITY_ID_KEYS). */
const ENTITY_PRIMARY_ID_KEYS: Partial<
  Record<(typeof EntityType)[keyof typeof EntityType], string>
> = {
  [EntityType.CONNECTOR]: 'connector_id',
  [EntityType.CONNECTION]: 'connection_id',
  [EntityType.WORKFLOW]: 'workflow_id',
  [EntityType.TRANSFORMATION]: 'transformation_id',
  [EntityType.VALIDATION]: 'validation_id',
  [EntityType.DATA_PRODUCT]: 'data_product_id',
  [EntityType.DOMAIN]: 'domain_id',
  [EntityType.SCHEMA]: 'schema_id',
  [EntityType.CONTRACT]: 'contract_id',
  [EntityType.QUALITY_RULE]: 'quality_rule_id',
  [EntityType.EXPORT]: 'export_id',
};

/** Entity types that may appear as upstream_entity_id targets within a package. */
const UPSTREAM_REFERENCE_ENTITY_TYPES = new Set<(typeof EntityType)[keyof typeof EntityType]>([
  EntityType.CONNECTION,
  EntityType.TRANSFORMATION,
  EntityType.VALIDATION,
  EntityType.DATA_PRODUCT,
]);

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
        continue;
      }
      entities.push({ path: rel, entityType, data });
    }
  }

  return entities;
}

function entityName(entity: DiscoveredEntity): string | undefined {
  const name = entity.data.name;
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function entityStableId(entity: DiscoveredEntity): string {
  const primary = primaryEntityId(entity);
  if (primary) return primary;
  if (entity.entityType === EntityType.WORKFLOW) {
    const match = entity.path.match(/^workflows\/([^/]+)\/workflow\.json$/);
    if (match?.[1]) return match[1];
  }
  return entity.path;
}

/**
 * Resolve the entity's own primary ID for its type.
 * Never prefers parent/reference IDs (workflow_id, connector_id on connections, etc.).
 */
export function primaryEntityId(entity: {
  entityType: (typeof EntityType)[keyof typeof EntityType];
  data: Record<string, unknown>;
}): string | undefined {
  const key = ENTITY_PRIMARY_ID_KEYS[entity.entityType];
  if (!key) return undefined;
  const id = entity.data[key];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * True when a connection is a data-product trigger (canonical hyphen spelling only).
 * Checks `type` then `connector_type`, matching backend resolveConnectionConnectorType.
 */
export function isDataProductTriggerConnection(data: Record<string, unknown>): boolean {
  const raw = data.type ?? data.connector_type;
  return typeof raw === 'string' && raw.trim() === DATA_PRODUCT_TRIGGER_TYPE;
}

/**
 * True when a connection uses the rejected underscore spelling of the trigger type.
 */
export function isLegacyDataProductTriggerSpelling(data: Record<string, unknown>): boolean {
  const candidates = [data.type, data.connector_type];
  return candidates.some(
    raw => typeof raw === 'string' && raw.trim() === DATA_PRODUCT_TRIGGER_TYPE_LEGACY
  );
}

function pathInWorkflow(relPath: string, workflowId: string): boolean {
  return (
    relPath === `workflows/${workflowId}/workflow.json` ||
    relPath.startsWith(`workflows/${workflowId}/`)
  );
}

/**
 * Flag duplicate workflow / data-product display names across the local project.
 * Matches Postgres UNIQUE(project_id, name) on workflows and data_products.
 */
function checkProjectScopedNameUniqueness(
  entities: DiscoveredEntity[],
  issues: LintIssue[],
  scopeWorkflowId?: string
): void {
  type NameGroup = { name: string; kind: 'workflow' | 'data product'; entities: DiscoveredEntity[] };
  const groups = new Map<string, NameGroup>();

  for (const entity of entities) {
    const kind =
      entity.entityType === EntityType.WORKFLOW
        ? ('workflow' as const)
        : entity.entityType === EntityType.DATA_PRODUCT
          ? ('data product' as const)
          : null;
    if (!kind) continue;
    const name = entityName(entity);
    if (!name) continue;
    const key = `${kind}:${name}`;
    const existing = groups.get(key);
    if (existing) {
      existing.entities.push(entity);
    } else {
      groups.set(key, { name, kind, entities: [entity] });
    }
  }

  for (const group of groups.values()) {
    const byId = new Map<string, DiscoveredEntity>();
    for (const entity of group.entities) {
      byId.set(entityStableId(entity), entity);
    }
    if (byId.size < 2) continue;

    const distinct = [...byId.values()];
    const scoped = scopeWorkflowId
      ? distinct.filter(e => pathInWorkflow(e.path, scopeWorkflowId))
      : distinct;
    if (scoped.length === 0) continue;

    for (const entity of scoped) {
      const others = distinct
        .filter(o => o.path !== entity.path)
        .map(o => o.path)
        .sort();
      issues.push({
        path: entity.path,
        severity: 'error',
        message:
          `Duplicate ${group.kind} name "${group.name}" in this project ` +
          `(also ${others.join(', ')}). Names must be unique within a project.`,
      });
    }
  }
}

function buildEntityIndex(
  entities: DiscoveredEntity[]
): Map<(typeof EntityType)[keyof typeof EntityType], Map<string, DiscoveredEntity>> {
  const byType = new Map<(typeof EntityType)[keyof typeof EntityType], Map<string, DiscoveredEntity>>();
  for (const entity of entities) {
    const id = primaryEntityId(entity);
    if (!id) continue;
    let typeMap = byType.get(entity.entityType);
    if (!typeMap) {
      typeMap = new Map();
      byType.set(entity.entityType, typeMap);
    }
    typeMap.set(id, entity);
  }
  return byType;
}

function resolveUpstreamEntityType(
  data: Record<string, unknown>
): (typeof EntityType)[keyof typeof EntityType] | undefined {
  const upstreamType = data.upstream_entity_type;
  if (typeof upstreamType !== 'string') return undefined;
  if ((Object.values(EntityType) as string[]).includes(upstreamType)) {
    return upstreamType as (typeof EntityType)[keyof typeof EntityType];
  }
  return undefined;
}

function findUpstreamInIndex(
  byType: Map<(typeof EntityType)[keyof typeof EntityType], Map<string, DiscoveredEntity>>,
  upstreamId: string,
  preferredType?: (typeof EntityType)[keyof typeof EntityType]
): { entity: DiscoveredEntity; entityType: (typeof EntityType)[keyof typeof EntityType] } | undefined {
  if (preferredType) {
    const typed = byType.get(preferredType)?.get(upstreamId);
    if (typed) return { entity: typed, entityType: preferredType };
    return undefined;
  }
  for (const entityType of UPSTREAM_REFERENCE_ENTITY_TYPES) {
    const typed = byType.get(entityType)?.get(upstreamId);
    if (typed) return { entity: typed, entityType };
  }
  return undefined;
}

function checkUpstreamReferences(
  entities: DiscoveredEntity[],
  byType: Map<(typeof EntityType)[keyof typeof EntityType], Map<string, DiscoveredEntity>>,
  issues: LintIssue[]
): void {
  const upstreamCarriers: Array<(typeof EntityType)[keyof typeof EntityType]> = [
    EntityType.DATA_PRODUCT,
    EntityType.TRANSFORMATION,
    EntityType.VALIDATION,
    EntityType.CONNECTION,
  ];

  for (const entity of entities) {
    if (!upstreamCarriers.includes(entity.entityType)) continue;
    const upstream = entity.data.upstream_entity_id;
    if (typeof upstream !== 'string' || upstream.length === 0) continue;

    const preferredType = resolveUpstreamEntityType(entity.data);
    const found = findUpstreamInIndex(byType, upstream, preferredType);

    if (!found) {
      // Wrong-type: ID exists under another entity type when a type was declared.
      if (preferredType) {
        const elsewhere = findUpstreamInIndex(byType, upstream);
        if (elsewhere) {
          issues.push({
            path: entity.path,
            severity: 'error',
            message:
              `upstream_entity_id "${upstream}" is a ${elsewhere.entityType} entity, ` +
              `but upstream_entity_type is "${preferredType}"`,
          });
          continue;
        }
      }
      issues.push({
        path: entity.path,
        severity: 'error',
        message: preferredType
          ? `upstream_entity_id "${upstream}" not found as ${preferredType} in local package`
          : `upstream_entity_id "${upstream}" not found in local package`,
      });
    }
  }
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
  const byType = buildEntityIndex(entities);

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
  }

  // Relationship checks
  for (const entity of entities) {
    if (entity.entityType === EntityType.CONNECTION) {
      if (isLegacyDataProductTriggerSpelling(entity.data)) {
        issues.push({
          path: entity.path,
          severity: 'error',
          message:
            `connection type must be "${DATA_PRODUCT_TRIGGER_TYPE}" ` +
            `(not "${DATA_PRODUCT_TRIGGER_TYPE_LEGACY}")`,
        });
        continue;
      }
      // DP→DP triggers are not bound to an external connector.
      if (isDataProductTriggerConnection(entity.data)) {
        continue;
      }
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
  }

  checkUpstreamReferences(entities, byType, issues);

  // Name uniqueness is project-scoped in Postgres — always scan the full local tree,
  // even when --workflow narrows schema validation to one package.
  const uniquenessEntities = workflow_id != null ? discoverEntities(projectDir) : entities;
  checkProjectScopedNameUniqueness(uniquenessEntities, issues, workflow_id);

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
  return (
    existsSync(join(projectDir, 'connectors')) &&
    listJsonFiles(join(projectDir, 'connectors')).length > 0
  );
}
