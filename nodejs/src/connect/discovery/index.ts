/**
 * Shared discovery core — one pipeline; adapters import this, do not fork types.
 */

export type {
  DiscoverySourceKind,
  DiscoveryAuthState,
  DiscoveryCandidate,
  DiscoveryProposal,
  DiscoveryGate,
  DiscoveryApplyResult,
  DiscoveryMetadataStamp,
} from './types.js';

export { hashFingerprintMaterial } from './fingerprint.js';

export {
  authDedupeKey,
  buildAuthIssueTitle,
  buildAuthIssueDescription,
  buildAuthIssueCreatePayload,
  type BuildAuthIssueDescriptionInput,
  type AuthIssueCreatePayload,
} from './auth-issue.js';

export {
  buildDiscoveryMetadataStamp,
  type BuildDiscoveryMetadataInput,
} from './metadata.js';
