/**
 * Skill types for the scoped access model.
 *
 * A skill defines which platform resources and operations an AI agent may
 * reach within a workspace. The scope is fail-closed: any check that cannot
 * complete blocks the operation.
 */

/**
 * The set of resource types a skill can scope access to.
 * Each key maps to a list of permitted resource identifiers (IDs or names).
 */
export interface SkillScope {
  data_products?: string[];
  connectors?: string[];
  workflows?: string[];
  domains?: string[];
  queues?: string[];
}

/**
 * The set of operations that can be permitted on a resource type.
 */
export type Operation = 'read' | 'write' | 'create' | 'delete';

/**
 * A parsed skill definition from `.loxtep/skills/<name>.yaml`.
 */
export interface SkillDefinition {
  name: string;
  description?: string;
  scope: SkillScope;
  permissions: Partial<Record<keyof SkillScope, Operation[]>>;
}

/**
 * The result of a scope check decision.
 * Only `{ allowed: true }` permits execution. All other variants deny.
 */
export type ScopeDecision =
  | { allowed: true }
  | { allowed: false; code: 'SCOPE_VIOLATION'; deniedResource: string }
  | { allowed: false; code: 'OPERATION_DENIED'; deniedOperation: Operation; resource: string }
  | { allowed: false; code: 'UNKNOWN_SKILL'; skillName: string }
  | { allowed: false; code: 'SCOPE_VALIDATION_FAILED' };
