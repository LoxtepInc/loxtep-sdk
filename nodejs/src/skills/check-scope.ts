/**
 * Pure fail-closed scope decision function.
 *
 * `checkScope` determines whether a given operation on a resource is permitted
 * by a skill definition. The function is deny-by-default: if any check fails
 * or cannot complete, the operation is blocked.
 *
 * Decision logic (in order):
 * 1. If the skill definition is undefined → UNKNOWN_SKILL
 * 2. If the resource type has no scope entries, or the resource id is not
 *    in the scope list → SCOPE_VIOLATION
 * 3. If the resource type has no permissions, or the operation is not in
 *    the permissions list → OPERATION_DENIED
 * 4. Otherwise → allowed
 *
 * Any unexpected error during validation → SCOPE_VALIDATION_FAILED (fail-closed)
 */

import type { SkillDefinition, SkillScope, Operation, ScopeDecision } from './types.js';

/**
 * Check whether a specific operation on a resource is permitted by a skill.
 *
 * @param skill - The skill definition to check against, or undefined if not found
 * @param resourceType - The type of resource being accessed (e.g. 'data_products')
 * @param resourceId - The specific resource identifier being accessed
 * @param operation - The operation being attempted (read, write, create, delete)
 * @returns A ScopeDecision indicating whether the operation is allowed or denied
 */
export function checkScope(
  skill: SkillDefinition | undefined,
  resourceType: keyof SkillScope,
  resourceId: string,
  operation: Operation
): ScopeDecision {
  try {
    // 1. Unknown skill — no definition provided
    if (skill === undefined) {
      return { allowed: false, code: 'UNKNOWN_SKILL', skillName: '' };
    }

    // 2. Scope check — is the resource within the skill's declared scope?
    const scopeList = skill.scope[resourceType];
    if (!scopeList || !scopeList.includes(resourceId)) {
      return {
        allowed: false,
        code: 'SCOPE_VIOLATION',
        deniedResource: `${resourceType}/${resourceId}`,
      };
    }

    // 3. Permission check — is the operation allowed for this resource type?
    const permittedOps = skill.permissions[resourceType];
    if (!permittedOps || !permittedOps.includes(operation)) {
      return {
        allowed: false,
        code: 'OPERATION_DENIED',
        deniedOperation: operation,
        resource: `${resourceType}/${resourceId}`,
      };
    }

    // 4. All checks pass
    return { allowed: true };
  } catch {
    // Fail-closed: any unexpected error blocks the operation
    return { allowed: false, code: 'SCOPE_VALIDATION_FAILED' };
  }
}

/**
 * Resolve a skill by name from a map and check scope in one step.
 * Convenience wrapper used by both the SDK client-side enforcement and
 * the MCP server-side checker.
 *
 * @param skills - Map of skill name → SkillDefinition
 * @param skillName - The name of the skill to look up
 * @param resourceType - The type of resource being accessed
 * @param resourceId - The specific resource identifier
 * @param operation - The operation being attempted
 * @returns A ScopeDecision
 */
export function checkScopeByName(
  skills: Map<string, SkillDefinition>,
  skillName: string,
  resourceType: keyof SkillScope,
  resourceId: string,
  operation: Operation
): ScopeDecision {
  try {
    const skill = skills.get(skillName);
    if (!skill) {
      return { allowed: false, code: 'UNKNOWN_SKILL', skillName };
    }
    return checkScope(skill, resourceType, resourceId, operation);
  } catch {
    return { allowed: false, code: 'SCOPE_VALIDATION_FAILED' };
  }
}
