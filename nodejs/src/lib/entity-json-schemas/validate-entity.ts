/**
 * Offline entity validation against vendored JSON Schemas (Ajv).
 * Schemas live in `nodejs/schemas/entity-json-schemas/` (shipped with the npm package).
 *
 * Ajv is loaded via `ajv-loader.cjs` so Jest (CJS) does not need `import.meta` or ESM ajv.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { EntityType, ENTITY_SCHEMA_FILES } from './types.js';

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

function findPackageRootCandidates(): string[] {
  const roots: string[] = [process.cwd()];
  const entry = process.argv[1];
  if (entry) {
    let dir = dirname(entry);
    for (let i = 0; i < 8; i++) {
      roots.push(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return roots;
}

function loadAjv(): { Ajv: AjvConstructor; addFormats: (ajv: AjvInstance) => void } {
  for (const root of findPackageRootCandidates()) {
    for (const rel of [
      'src/lib/entity-json-schemas/ajv-loader.cjs',
      'dist/lib/entity-json-schemas/ajv-loader.cjs',
    ]) {
      const loaderPath = join(root, rel);
      if (!existsSync(loaderPath)) continue;
      const req = createRequire(loaderPath);
      return req(loaderPath) as {
        Ajv: AjvConstructor;
        addFormats: (ajv: AjvInstance) => void;
      };
    }
  }

  // Last resort: resolve ajv from cwd package.json (dev / monorepo).
  const req = createRequire(join(process.cwd(), 'package.json'));
  const ajvMod = req('ajv') as { Ajv?: AjvConstructor; default?: AjvConstructor } & AjvConstructor;
  const formatsMod = req('ajv-formats') as
    | ((ajv: AjvInstance) => void)
    | { default: (ajv: AjvInstance) => void };
  return {
    Ajv: ajvMod.Ajv ?? ajvMod.default ?? ajvMod,
    addFormats: typeof formatsMod === 'function' ? formatsMod : formatsMod.default,
  };
}

const { Ajv: AjvCtor, addFormats } = loadAjv();

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
  const candidates = findPackageRootCandidates().map(root =>
    join(root, 'schemas', 'entity-json-schemas')
  );
  candidates.push(join(process.cwd(), 'nodejs', 'schemas', 'entity-json-schemas'));

  for (const dir of candidates) {
    if (existsSync(join(dir, 'workflow.json'))) {
      return dir;
    }
  }
  throw new Error(
    `Entity JSON schemas not found. Expected schemas/entity-json-schemas (tried: ${candidates.join(', ')})`
  );
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
