/**
 * client.team.directory — directory discover → propose → human gate → invite (#4807).
 */

import type { LoxtepHttpClient } from '../http/client.js';
import {
  discoverDirectoryPeople as runDiscoverDirectoryPeople,
  inviteFromDirectory as runInviteFromDirectory,
  proposeInvitees as runProposeInvitees,
  type BulkInviteResponse,
  type DirectoryDiscoverResult,
  type DirectoryOrgContext,
  type DirectoryPerson,
  type DiscoverDirectoryPeopleOptions,
  type InviteFromDirectoryOptions,
  type InviteProposal,
  type ProposeInviteesOptions,
} from '../team/directory-discovery/index.js';

export interface TeamDirectoryApiDeps {
  http: LoxtepHttpClient;
  organization_id?: string;
}

export type TeamDirectoryApi = {
  discoverDirectoryPeople: (
    opts?: DiscoverDirectoryPeopleOptions
  ) => Promise<DirectoryDiscoverResult>;
  proposeInvitees: (
    people?: DirectoryPerson[],
    opts?: ProposeInviteesOptions
  ) => Promise<InviteProposal[]>;
  /**
   * Apply invites for an explicit selection only.
   * Requires emails / fingerprints / selected — never auto-invites all.
   */
  inviteFromDirectory: (
    opts: InviteFromDirectoryOptions
  ) => Promise<BulkInviteResponse>;
};

/**
 * Wire directory invite discovery onto the Team facade.
 */
export function createTeamDirectoryApi(deps: TeamDirectoryApiDeps): TeamDirectoryApi {
  return {
    async discoverDirectoryPeople(opts: DiscoverDirectoryPeopleOptions = {}) {
      return runDiscoverDirectoryPeople(
        {
          http: deps.http,
          organization_id: deps.organization_id,
          org_context: undefined,
        },
        {
          ...opts,
          organization_id: opts.organization_id ?? deps.organization_id,
        }
      );
    },

    async proposeInvitees(
      people: DirectoryPerson[] = [],
      opts: ProposeInviteesOptions = {}
    ) {
      const org: DirectoryOrgContext = opts.org ?? {
        member_emails: [],
        pending_invite_emails: [],
      };
      return runProposeInvitees(people, org, opts.source_kind ?? 'directory_csv');
    },

    async inviteFromDirectory(opts: InviteFromDirectoryOptions) {
      return runInviteFromDirectory(
        {
          http: deps.http,
          organization_id: deps.organization_id,
        },
        {
          ...opts,
          organization_id: opts.organization_id ?? deps.organization_id,
        }
      );
    },
  };
}
