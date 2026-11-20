/**
 * Directory invite adapter on the shared discovery pipeline (loxtep#4807).
 * Imports connect/discovery core — does not fork fingerprint / auth-issue / metadata.
 */

export type {
  InviteDisposition,
  DirectoryPersonStatus,
  DirectorySourceType,
  DirectoryPerson,
  InviteProposal,
  DirectoryOrgContext,
  DirectoryDiscoverResult,
  DiscoverDirectoryPeopleOptions,
  ProposeInviteesOptions,
  InviteFromDirectoryOptions,
  BulkInviteSuccess,
  BulkInviteFailure,
  BulkInviteResponse,
  DiscoveryCandidate,
  DiscoveryGate,
  DiscoveryProposal,
  DiscoverySourceKind,
} from './types.js';

export { DIRECTORY_CONNECTOR_TYPE_GOOGLE_WORKSPACE } from './types.js';

export { directoryPersonFingerprint } from './fingerprint.js';
export { parseDirectoryCsv } from './parse-csv.js';
export {
  personToCandidate,
  proposeInvitees,
  summarizeProposals,
} from './propose.js';
export {
  emptyHumanPickGate,
  selectProposalsForInvite,
  emailsForSelectedInvites,
  resolveSelection,
} from './gate.js';
export {
  discoverDirectoryPeople,
  type DirectoryDiscoverDeps,
} from './discover.js';
export {
  inviteFromDirectory,
  type InviteFromDirectoryDeps,
} from './apply.js';
