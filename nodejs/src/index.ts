/**
 * @loxtep/sdk - Loxtep Node.js SDK
 * Phase 1: errors + LoxtepClient (stubs); HTTP and auth in LOX-951, LOX-949.
 */

export * from './errors/index.js';
export * from './client/index.js';
export * from './config/index.js';
export * from './auth/index.js';
export * from './http/index.js';
export * from './checkpoint/index.js';
export * from './streaming/index.js';
export * from './types/index.js';
export * from './codegen/index.js';
export * from './skills/index.js';
export * from './authoring/index.js';
export { buildSdkIngestBundle, buildSdkIngestLocalPackage } from './lib/sdk-ingest-bundle.js';
export type {
  SdkIngestBundleParams,
  SdkIngestBundleResult,
  SdkIngestPackageParams,
  SdkIngestPackageResult,
} from './lib/sdk-ingest-bundle.js';
export {
  EntityType,
  validateEntity,
  validateEntityOrThrow,
} from './lib/entity-json-schemas/index.js';
export { lintLocalPackage, hasLocalEntityPackage } from './lib/workspace-lint.js';
export type { LintIssue, LintResult } from './lib/workspace-lint.js';
