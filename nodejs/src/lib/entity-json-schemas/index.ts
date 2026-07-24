export { EntityType, ENTITY_SCHEMA_FILES } from './types.js';
export type { EntityType as EntityTypeName } from './types.js';
export {
  validateEntity,
  validateEntityOrThrow,
  loadSchema,
  getValidator,
  resetEntityValidatorsForTests,
} from './validate-entity.js';
export type { EntityValidationError, EntityValidationResult } from './validate-entity.js';
