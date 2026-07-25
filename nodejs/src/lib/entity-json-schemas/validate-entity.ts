/**
 * Offline entity validation against vendored JSON Schemas (Ajv).
 * Schemas live in `nodejs/schemas/entity-json-schemas/` (shipped with the npm package).
 *
 * Ajv is loaded via `ajv-loader.cjs`, required by *relative path* below (not located by
 * searching `process.argv`/`process.cwd()`). A relative `require`/`import` always resolves
 * against this file's own location, so it finds the right sibling `ajv-loader.cjs` (in `src/`
 * under Jest, in `dist/` when published) and — critically — `ajv-loader.cjs`'s own
 * `require('ajv')` then resolves through `@loxtep/sdk`'s own `node_modules`, regardless of
 * the caller's cwd/entry point or package manager (this used to break under pnpm's strict
 * `node_modules` when the SDK was imported as a library rather than run as the CLI).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType, ENTITY_SCHEMA_FILES } from './types.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS interop, see comment above.
import ajvLoader = require('./ajv-loader.cjs');

type AjvErrorObject = {
  instancePath?: string;
  schemaPath?: string;
  message?: string;
  params?: Record<string, unknown>;
};

type ValidateFunction = ((data: unknown) => boolean) & {
  errors?: AjvErrorObject[] | null;
};

type AjvInstance = {
  compile: (schema: object) => ValidateFunction;
  addSchema: (schema: object | object[], key?: string) => AjvInstance;
  getSchema: (keyRef: string) => ValidateFunction | undefined;
};

type AjvConstructor = new (opts?: {
  allErrors?: boolean;
  strict?: boolean;
  validateFormats?: boolean;
}) => AjvInstance;

const { Ajv: AjvCtor, addFormats, packageRoot } = ajvLoader as {
  Ajv: AjvConstructor;
  addFormats: (ajv: AjvInstance) => void;
  packageRoot: string;
};

export interface EntityValidationError {
  path: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface EntityValidationResult {
  valid: boolean;
  errors?: EntityValidationError[];
}

let ajvInstance: AjvInstance | null = null;
const validatorCache = new Map<EntityType, ValidateFunction>();

function resolveSchemasDir(): string {
  const dir = join(packageRoot, 'schemas', 'entity-json-schemas');
  if (existsSync(join(dir, 'workflow.json'))) {
    return dir;
  }
  throw new Error(`Entity JSON schemas not found. Expected ${dir}`);
}

function getAjv(): AjvInstance {
  if (!ajvInstance) {
    ajvInstance = new AjvCtor({
      allErrors: true,
      strict: false,
      validateFormats: true,
    });
    addFormats(ajvInstance);

    // Register all shipped schemas so $ref (e.g. odps-product) resolves.
    const schemasDir = resolveSchemasDir();
    for (const file of readdirSync(schemasDir)) {
      if (!file.endsWith('.json')) continue;
      const schema = JSON.parse(readFileSync(join(schemasDir, file), 'utf8')) as {
        $id?: string;
      };
      if (!schema.$id) continue;
      if (!ajvInstance.getSchema(schema.$id)) {
        ajvInstance.addSchema(schema);
      }
    }
  }
  return ajvInstance;
}

export function loadSchema(entityType: EntityType): object {
  const file = ENTITY_SCHEMA_FILES[entityType];
  if (!file) {
    throw new Error(`No schema defined for entity type: ${entityType}`);
  }
  const path = join(resolveSchemasDir(), file);
  return JSON.parse(readFileSync(path, 'utf8')) as object;
}

export function getValidator(entityType: EntityType): ValidateFunction {
  const cached = validatorCache.get(entityType);
  if (cached) return cached;

  const schema = loadSchema(entityType) as { $id?: string };
  const ajv = getAjv();
  let validator: ValidateFunction | undefined;
  if (schema.$id) {
    validator = ajv.getSchema(schema.$id);
  }
  if (!validator) {
    validator = ajv.compile(schema);
  }
  validatorCache.set(entityType, validator);
  return validator;
}

function mapAjvErrors(errors: AjvErrorObject[] | null | undefined): EntityValidationError[] {
  if (!errors?.length) return [];
  return errors.map(err => ({
    path: err.instancePath || err.schemaPath || '',
    message: err.message || 'Validation error',
    params: err.params,
  }));
}

/**
 * Validate an entity object against its shipped JSON Schema.
 */
export function validateEntity(
  entityType: EntityType,
  entity: unknown
): EntityValidationResult {
  const validator = getValidator(entityType);
  const valid = validator(entity);
  if (!valid) {
    return { valid: false, errors: mapAjvErrors(validator.errors) };
  }
  return { valid: true };
}

/**
 * Validate and throw if invalid.
 */
export function validateEntityOrThrow(entityType: EntityType, entity: unknown): void {
  const result = validateEntity(entityType, entity);
  if (!result.valid) {
    const msg = result.errors?.map(e => `${e.path}: ${e.message}`).join(', ');
    throw new Error(`Entity validation failed for ${entityType}: ${msg || 'Unknown error'}`);
  }
}

/** Reset Ajv cache (tests). */
export function resetEntityValidatorsForTests(): void {
  ajvInstance = null;
  validatorCache.clear();
}
