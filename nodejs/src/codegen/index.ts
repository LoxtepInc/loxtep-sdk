/**
 * Codegen module — typed Workspace Context generation pipeline.
 *
 * The pipeline has four stages:
 * 1. load (I/O) — fetch resources from the control plane
 * 2. normalize (pure) — deterministic key derivation + canonical ordering
 * 3. emit (pure) — render typed TypeScript source
 * 4. write (I/O) — atomic file write
 *
 * @module codegen
 */

export type {
  JsonSchema,
  WorkspaceContext,
  NormalizedContext,
  NormalizedResource,
  GenerateCounts,
} from './types.js';

export { loadWorkspaceContext } from './load-workspace-context.js';
export { deriveKey, normalizeContext } from './normalize.js';
export { emitArtifact } from './emit.js';
export { writeArtifact, computeCounts } from './write-artifact.js';
