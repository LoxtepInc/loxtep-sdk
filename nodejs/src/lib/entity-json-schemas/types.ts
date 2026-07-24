/**
 * Entity types that have shipped JSON Schemas in this package.
 * Mirrors platform `EntityType` string values.
 */
export const EntityType = {
  DOMAIN: 'domains',
  CONNECTOR: 'connectors',
  CONNECTION: 'connections',
  WORKFLOW: 'workflows',
  TRANSFORMATION: 'transformations',
  VALIDATION: 'validations',
  DATA_PRODUCT: 'data-products',
  SCHEMA: 'schemas',
  CONTRACT: 'contracts',
  QUALITY_RULE: 'quality-rules',
  EXPORT: 'exports',
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

/** Map entity type → schema filename (without path). */
export const ENTITY_SCHEMA_FILES: Record<EntityType, string> = {
  [EntityType.DOMAIN]: 'domain.json',
  [EntityType.CONNECTOR]: 'connector.json',
  [EntityType.CONNECTION]: 'connection.json',
  [EntityType.WORKFLOW]: 'workflow.json',
  [EntityType.TRANSFORMATION]: 'transformation.json',
  [EntityType.VALIDATION]: 'validation.json',
  [EntityType.DATA_PRODUCT]: 'data-product.json',
  [EntityType.SCHEMA]: 'schema.json',
  [EntityType.CONTRACT]: 'contract.json',
  [EntityType.QUALITY_RULE]: 'quality-rule.json',
  [EntityType.EXPORT]: 'export.json',
};
