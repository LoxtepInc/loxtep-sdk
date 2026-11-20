/**
 * discoverDirectoryPeople — CSV and/or directory connector roster → propose.
 * Never starts Products ingest. Never invites.
 */

import type { LoxtepHttpClient } from '../../http/client.js';
import { directoryPersonFingerprint } from './fingerprint.js';
import { emptyHumanPickGate } from './gate.js';
import { parseDirectoryCsv } from './parse-csv.js';
import { proposeInvitees, summarizeProposals } from './propose.js';
import type {
  DirectoryDiscoverResult,
  DirectoryOrgContext,
  DirectoryPerson,
  DirectoryPersonStatus,
  DiscoverDirectoryPeopleOptions,
  DiscoverySourceKind,
  InviteDisposition,
  InviteProposal,
} from './types.js';

export interface DirectoryDiscoverDeps {
  http?: LoxtepHttpClient;
  organization_id?: string;
  /** Local org context when not using platform directory-discover. */
  org_context?: DirectoryOrgContext;
}

function peopleFromInput(
  opts: DiscoverDirectoryPeopleOptions
): DirectoryPerson[] {
  const sourceKind: DiscoverySourceKind = opts.connector_id
    ? 'directory_connector'
    : 'directory_csv';
  const source =
    sourceKind === 'directory_connector'
      ? opts.connector_id
        ? `connector:${opts.connector_id}`
        : 'directory_connector'
      : 'csv';

  if (opts.people?.length) {
    return opts.people.map((p) => {
      const email = p.email.trim().toLowerCase();
      return {
        email,
        display_name: p.display_name,
        external_id: p.external_id,
        department: p.department,
        status: (p.status ?? 'active') as DirectoryPersonStatus,
        source,
        fingerprint: directoryPersonFingerprint(email, source),
      };
    });
  }

  if (opts.csv_data) {
    return parseDirectoryCsv({
      csv_data: opts.csv_data,
      csv_encoding: opts.csv_encoding ?? 'plain',
      delimiter: opts.delimiter ?? ',',
      source: 'csv',
    });
  }

  return [];
}

function normalizePlatformProposal(raw: Record<string, unknown>): InviteProposal {
  const candidateRaw = (raw.candidate ?? {}) as Record<string, unknown>;
  const payloadRaw = (candidateRaw.payload ?? {}) as Record<string, unknown>;
  const annotationsRaw = (raw.annotations ?? {}) as Record<string, unknown>;

  return {
    candidate: {
      fingerprint: String(candidateRaw.fingerprint ?? ''),
      origin: String(candidateRaw.origin ?? ''),
      source_kind: String(
        candidateRaw.source_kind ?? candidateRaw.sourceKind ?? 'directory_csv'
      ),
      display_hint: (candidateRaw.display_hint ?? candidateRaw.displayHint) as
        | string
        | undefined,
      payload: {
        email: payloadRaw.email as string | undefined,
        display_name: (payloadRaw.display_name ?? payloadRaw.displayName) as
          | string
          | undefined,
        external_id: (payloadRaw.external_id ?? payloadRaw.externalId) as
          | string
          | undefined,
        department: payloadRaw.department as string | undefined,
        person_status: (payloadRaw.person_status ?? payloadRaw.personStatus) as
          | DirectoryPersonStatus
          | undefined,
      },
    },
    disposition: String(raw.disposition ?? 'skip_no_email') as InviteDisposition,
    display_name: String(raw.display_name ?? raw.displayName ?? ''),
    reason: String(raw.reason ?? ''),
    annotations: {
      already_member: Boolean(
        annotationsRaw.already_member ?? annotationsRaw.alreadyMember ?? false
      ),
      pending_invite: Boolean(
        annotationsRaw.pending_invite ?? annotationsRaw.pendingInvite ?? false
      ),
      suggested: Boolean(annotationsRaw.suggested ?? false),
    },
  };
}

async function fetchConnectorRoster(
  http: LoxtepHttpClient,
  connectorId: string,
  maxResults?: number
): Promise<{
  people: DirectoryPerson[];
  auth_state: 'authed' | 'needs_auth';
  connector_type?: string;
}> {
  const res = await http.post<
    | {
        success: true;
        data: {
          connector_id: string;
          connector_type: string;
          people: Array<{
            email: string;
            display_name?: string;
            external_id?: string;
            department?: string;
            status?: DirectoryPersonStatus;
          }>;
          ingest_started: false;
          auth_state: 'authed' | 'needs_auth';
        };
      }
    | {
        connector_id: string;
        connector_type: string;
        people: Array<Record<string, unknown>>;
        auth_state: 'authed' | 'needs_auth';
      }
  >(`/connectors/connectors/${encodeURIComponent(connectorId)}/directory-roster`, {
    max_results: maxResults ?? 200,
  });

  const data = (res as { data?: Record<string, unknown> }).data ?? (res as Record<string, unknown>);
  const authState = (data.auth_state as 'authed' | 'needs_auth') ?? 'needs_auth';
  const source = `connector:${connectorId}`;
  const peopleRaw = Array.isArray(data.people) ? data.people : [];
  const people: DirectoryPerson[] = peopleRaw.map((row) => {
    const r = row as Record<string, unknown>;
    const email = String(r.email ?? '')
      .trim()
      .toLowerCase();
    return {
      email,
      display_name: (r.display_name ?? r.displayName) as string | undefined,
      external_id: (r.external_id ?? r.externalId) as string | undefined,
      department: r.department as string | undefined,
      status: ((r.status as DirectoryPersonStatus) ?? 'active') as DirectoryPersonStatus,
      source,
      fingerprint: directoryPersonFingerprint(email, source),
    };
  });

  return {
    people,
    auth_state: authState,
    connector_type: data.connector_type as string | undefined,
  };
}

async function platformDirectoryDiscover(
  http: LoxtepHttpClient,
  organizationId: string,
  opts: DiscoverDirectoryPeopleOptions,
  people: DirectoryPerson[]
): Promise<DirectoryDiscoverResult> {
  const sourceKind: DiscoverySourceKind = opts.connector_id
    ? 'directory_connector'
    : 'directory_csv';
  const body: Record<string, unknown> = {
    organization_id: organizationId,
    source_kind: sourceKind,
  };
  if (opts.csv_data && sourceKind === 'directory_csv' && !opts.people?.length) {
    body.csv_data = opts.csv_data;
    body.csv_encoding = opts.csv_encoding ?? 'plain';
    if (opts.delimiter) body.delimiter = opts.delimiter;
  } else {
    body.people = people.map((p) => ({
      email: p.email,
      display_name: p.display_name,
      external_id: p.external_id,
      department: p.department,
      status: p.status,
    }));
  }
  if (opts.connector_id) body.connector_id = opts.connector_id;
  if (opts.org_email_domain !== undefined) {
    body.org_email_domain = opts.org_email_domain;
  }

  const res = await http.post<{
    success?: true;
    data?: Record<string, unknown>;
    proposals?: unknown[];
  }>(
    `/organizations/organizations/${encodeURIComponent(organizationId)}/members/directory-discover`,
    body
  );

  const data =
    (res as { data?: Record<string, unknown> }).data ?? (res as Record<string, unknown>);
  const proposalsRaw = Array.isArray(data.proposals) ? data.proposals : [];
  const proposals = proposalsRaw.map((p) =>
    normalizePlatformProposal(p as Record<string, unknown>)
  );
  const metadataRaw = (data.metadata ?? {}) as Record<string, unknown>;
  const sourceRaw = (data.source ?? {}) as Record<string, unknown>;

  return {
    source_connector_id:
      (sourceRaw.connector_id as string | undefined) ??
      (sourceRaw.connectorId as string | undefined) ??
      opts.connector_id,
    source_kind: sourceKind,
    proposals,
    gate: emptyHumanPickGate(),
    ingest_started: false,
    metadata: {
      proposal_count: Number(
        metadataRaw.proposal_count ?? metadataRaw.proposalCount ?? proposals.length
      ),
      invite_new_count: Number(
        metadataRaw.invite_new_count ??
          metadataRaw.inviteNewCount ??
          proposals.filter((p) => p.disposition === 'invite_new').length
      ),
      skip_member_count: Number(
        metadataRaw.skip_member_count ??
          metadataRaw.skipMemberCount ??
          proposals.filter((p) => p.disposition === 'skip_member').length
      ),
      skip_pending_count: Number(
        metadataRaw.skip_pending_count ??
          metadataRaw.skipPendingCount ??
          proposals.filter((p) => p.disposition === 'skip_pending').length
      ),
    },
  };
}

function localDiscoverResult(
  people: DirectoryPerson[],
  opts: DiscoverDirectoryPeopleOptions,
  org?: DirectoryOrgContext,
  authState?: 'authed' | 'needs_auth' | 'unknown'
): DirectoryDiscoverResult {
  const sourceKind: DiscoverySourceKind = opts.connector_id
    ? 'directory_connector'
    : 'directory_csv';
  const proposals = proposeInvitees(
    people,
    {
      member_emails: org?.member_emails ?? [],
      pending_invite_emails: org?.pending_invite_emails ?? [],
      org_email_domain: opts.org_email_domain ?? org?.org_email_domain,
    },
    sourceKind
  );
  return {
    source_connector_id: opts.connector_id,
    source_kind: sourceKind,
    proposals,
    gate: emptyHumanPickGate(),
    ingest_started: false,
    auth_state: authState,
    metadata: summarizeProposals(proposals),
  };
}

/**
 * Discover directory people from CSV and/or a connected directory connector,
 * then propose invite dispositions. Gate defaults to empty human_pick.
 */
export async function discoverDirectoryPeople(
  deps: DirectoryDiscoverDeps,
  opts: DiscoverDirectoryPeopleOptions = {}
): Promise<DirectoryDiscoverResult> {
  const organizationId = opts.organization_id ?? deps.organization_id;
  let people = peopleFromInput(opts);
  let authState: 'authed' | 'needs_auth' | 'unknown' | undefined;

  if (opts.connector_id && deps.http && people.length === 0) {
    const roster = await fetchConnectorRoster(
      deps.http,
      opts.connector_id,
      opts.max_results
    );
    people = roster.people;
    authState = roster.auth_state;
    if (roster.auth_state === 'needs_auth') {
      return {
        source_connector_id: opts.connector_id,
        source_kind: 'directory_connector',
        proposals: [],
        gate: emptyHumanPickGate(),
        ingest_started: false,
        auth_state: 'needs_auth',
        metadata: {
          proposal_count: 0,
          invite_new_count: 0,
          skip_member_count: 0,
          skip_pending_count: 0,
        },
      };
    }
  }

  if (people.length === 0 && !opts.csv_data && !opts.connector_id) {
    throw new Error(
      'discoverDirectoryPeople requires csv_data, people, or connector_id'
    );
  }

  const usePlatform =
    opts.use_platform !== undefined
      ? opts.use_platform
      : Boolean(deps.http && organizationId);

  if (usePlatform && deps.http && organizationId) {
    try {
      const result = await platformDirectoryDiscover(
        deps.http,
        organizationId,
        opts,
        people
      );
      return {
        ...result,
        auth_state: authState ?? result.auth_state,
        ingest_started: false,
        gate: emptyHumanPickGate(),
      };
    } catch (err) {
      // Fall back to local propose when platform endpoint is unavailable.
      if (opts.use_platform === true) throw err;
    }
  }

  return localDiscoverResult(people, opts, deps.org_context, authState);
}
