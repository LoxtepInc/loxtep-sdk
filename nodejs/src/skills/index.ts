/**
 * Skill scoping model — YAML loader and fail-closed scope decision.
 *
 * A skill is a scoped integration bundle declaring which platform resources
 * and operations an AI agent may reach. The platform enforces scope fail-closed:
 * out-of-scope → SCOPE_VIOLATION, disallowed op → OPERATION_DENIED, unknown
 * skill → rejected, check failure → blocks the operation.
 */

export type {
  SkillScope,
  Operation,
  SkillDefinition,
  ScopeDecision,
} from './types.js';

export { checkScope, checkScopeByName } from './check-scope.js';
export {
  parseSkillYaml,
  loadSkillFromFile,
  loadSkillsFromDirectory,
  SkillDefinitionSchema,
} from './loader.js';
export type { SkillReferenceError, SkillValidationResult } from './validate-references.js';
export {
  validateSkillReferences,
  formatSkillValidationErrors,
} from './validate-references.js';
