/**
 * Generate-time skill validation against the Workspace_Context.
 *
 * During `loxtep generate`, every skill definition file at `.loxtep/skills/*.yaml`
 * is validated against the loaded Workspace_Context. If a skill references a
 * resource that does not exist in the context, `generate` exits non-zero with
 * the skill name and each missing resource identifier.
 *
 * Requirements: 5.8, 5.9
 */

import type { SkillDefinition, SkillScope } from './types.js';
import type { WorkspaceContext } from '../codegen/types.js';

/**
 * A single invalid resource reference found during validation.
 */
export interface SkillReferenceError {
  /** Name of the skill that contains the invalid reference */
  skillName: string;
  /** Resource type (e.g. 'data_products', 'connectors') */
  resourceType: keyof SkillScope;
  /** The identifier that does not exist in the Workspace_Context */
  missingIdentifier: string;
}

/**
 * Result of validating skill references against the workspace context.
 */
export type SkillValidationResult =
  | { valid: true }
  | { valid: false; errors: SkillReferenceError[] };

/**
 * Mapping from skill scope resource type keys to the corresponding
 * WorkspaceContext collection keys.
 */
const RESOURCE_TYPE_TO_CONTEXT_KEY: Record<keyof SkillScope, keyof WorkspaceContext> = {
  data_products: 'dataProducts',
  connectors: 'connectors',
  workflows: 'workflows',
  domains: 'domains',
  queues: 'queues',
};

/**
 * Extract the set of resource names available in the workspace context
 * for a given resource type.
 */
function getAvailableNames(
  context: WorkspaceContext,
  resourceType: keyof SkillScope
): Set<string> {
  const contextKey = RESOURCE_TYPE_TO_CONTEXT_KEY[resourceType];
  const collection = context[contextKey] as { name: string }[];
  return new Set(collection.map((r) => r.name));
}

/**
 * Validate all skill resource references against the loaded Workspace_Context.
 *
 * For each skill, every identifier listed in the skill's `scope` is checked
 * against the corresponding resource collection in the context. Resource
 * identifiers in skill scope files are matched by `name` against the workspace
 * context collections.
 *
 * @param skills - Map of skill name → SkillDefinition (loaded from `.loxtep/skills/`)
 * @param context - The Workspace_Context loaded from the platform
 * @returns Validation result: either `{ valid: true }` or `{ valid: false, errors: [...] }`
 */
export function validateSkillReferences(
  skills: Map<string, SkillDefinition>,
  context: WorkspaceContext
): SkillValidationResult {
  const errors: SkillReferenceError[] = [];

  for (const [, skill] of skills) {
    const resourceTypes = Object.keys(skill.scope) as (keyof SkillScope)[];

    for (const resourceType of resourceTypes) {
      const identifiers = skill.scope[resourceType];
      if (!identifiers || identifiers.length === 0) {
        continue;
      }

      const availableNames = getAvailableNames(context, resourceType);

      for (const identifier of identifiers) {
        if (!availableNames.has(identifier)) {
          errors.push({
            skillName: skill.name,
            resourceType,
            missingIdentifier: identifier,
          });
        }
      }
    }
  }

  if (errors.length === 0) {
    return { valid: true };
  }

  return { valid: false, errors };
}

/**
 * Format skill validation errors into human-readable error messages.
 * Each message identifies the skill name, resource type, and missing identifier.
 *
 * @param errors - Array of SkillReferenceError from validation
 * @returns Formatted error messages, one per line
 */
export function formatSkillValidationErrors(errors: SkillReferenceError[]): string {
  const lines = errors.map(
    (e) =>
      `Skill "${e.skillName}": references ${e.resourceType} "${e.missingIdentifier}" which does not exist in the workspace context`
  );
  return lines.join('\n');
}
