import {
  directoryPersonFingerprint,
  emailsForSelectedInvites,
  emptyHumanPickGate,
  inviteFromDirectory,
  parseDirectoryCsv,
  proposeInvitees,
  resolveSelection,
  selectProposalsForInvite,
  discoverDirectoryPeople,
} from './index.js';
import {
  authDedupeKey,
  buildAuthIssueTitle,
  buildDiscoveryMetadataStamp,
  hashFingerprintMaterial,
} from '../../connect/discovery/index.js';
import type { LoxtepHttpClient } from '../../http/client.js';

describe('shared discovery core', () => {
  it('hashes fingerprint material stably without secrets', () => {
    const a = hashFingerprintMaterial('email@x.com|csv');
    const b = hashFingerprintMaterial('email@x.com|csv');
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
    expect(a).not.toMatch(/secret|token/i);
  });

  it('builds shared auth dedupe + title', () => {
    expect(authDedupeKey('org-1', 'conn-1')).toBe('connector-auth:org-1:conn-1');
    expect(buildAuthIssueTitle('Google Workspace')).toBe('Authenticate Google Workspace');
  });

  it('builds discovery metadata stamp with source_kind', () => {
    const stamp = buildDiscoveryMetadataStamp({
      source: 'csv',
      fingerprint: 'abc',
      source_kind: 'directory_csv',
      extras: { note: 'ok' },
    });
    expect(stamp.source_kind).toBe('directory_csv');
    expect(stamp.fingerprint).toBe('abc');
    expect(stamp.proposed_at).toBeTruthy();
    expect(stamp.note).toBe('ok');
  });
});

describe('directory fingerprint + csv', () => {
  it('fingerprints email+source via shared hash', () => {
    const fp = directoryPersonFingerprint('Ada@Example.com', 'csv');
    expect(fp).toBe(hashFingerprintMaterial('ada@example.com|csv'));
  });

  it('parses CSV roster with header', () => {
    const people = parseDirectoryCsv({
      csv_data: 'email,display_name,department\nada@x.com,Ada,Eng\nbob@x.com,Bob,Sales\n',
    });
    expect(people).toHaveLength(2);
    expect(people[0].email).toBe('ada@x.com');
    expect(people[0].display_name).toBe('Ada');
    expect(people[0].fingerprint).toBeTruthy();
    expect(people[0].source).toBe('csv');
  });
});

describe('proposeInvitees annotations', () => {
  it('annotates members, pending, and suggested same-domain', () => {
    const people = parseDirectoryCsv({
      csv_data:
        'email,name\nmember@acme.com,Member\npending@acme.com,Pending\nnew@acme.com,New\next@other.com,Ext\n',
    });
    const proposals = proposeInvitees(people, {
      member_emails: ['member@acme.com'],
      pending_invite_emails: ['pending@acme.com'],
      org_email_domain: 'acme.com',
    });
    expect(proposals.find((p) => p.candidate.payload.email === 'member@acme.com')?.disposition).toBe(
      'skip_member'
    );
    expect(
      proposals.find((p) => p.candidate.payload.email === 'pending@acme.com')?.disposition
    ).toBe('skip_pending');
    const neu = proposals.find((p) => p.candidate.payload.email === 'new@acme.com');
    expect(neu?.disposition).toBe('invite_new');
    expect(neu?.annotations?.suggested).toBe(true);
    const ext = proposals.find((p) => p.candidate.payload.email === 'ext@other.com');
    expect(ext?.disposition).toBe('invite_new');
    expect(ext?.annotations?.suggested).toBe(false);
  });
});

describe('directory gate — never auto-invite all', () => {
  it('defaults to empty human_pick', () => {
    expect(emptyHumanPickGate()).toEqual({ mode: 'human_pick', selected: [] });
  });

  it('empty selection yields no invite emails', () => {
    const people = parseDirectoryCsv({
      csv_data: 'email\na@x.com\nb@x.com\nc@x.com\n',
    });
    const proposals = proposeInvitees(people);
    expect(emailsForSelectedInvites(proposals, [])).toEqual([]);
    expect(selectProposalsForInvite(proposals, [])).toEqual([]);
  });

  it('only selected inviteable rows are returned', () => {
    const people = parseDirectoryCsv({
      csv_data: 'email\na@x.com\nb@x.com\nmember@x.com\n',
    });
    const proposals = proposeInvitees(people, {
      member_emails: ['member@x.com'],
      pending_invite_emails: [],
    });
    const selected = selectProposalsForInvite(proposals, ['a@x.com']);
    expect(selected).toHaveLength(1);
    expect(selected[0].candidate.payload.email).toBe('a@x.com');
    expect(emailsForSelectedInvites(proposals, ['a@x.com'])).toEqual(['a@x.com']);
    // member skip_* never invited even if "selected"
    expect(emailsForSelectedInvites(proposals, ['member@x.com'])).toEqual([]);
  });

  it('resolveSelection merges emails/fingerprints/selected', () => {
    expect(
      resolveSelection({
        emails: ['A@X.com'],
        fingerprints: ['fp1'],
        selected: ['a@x.com', 'fp2'],
      }).sort()
    ).toEqual(['a@x.com', 'fp1', 'fp2']);
  });
});

describe('discoverDirectoryPeople local CSV', () => {
  it('returns proposals with empty gate and ingest_started false', async () => {
    const result = await discoverDirectoryPeople(
      {},
      {
        csv_data: 'email,name\nada@acme.com,Ada\nbob@acme.com,Bob\n',
        use_platform: false,
        org_email_domain: 'acme.com',
      }
    );
    expect(result.ingest_started).toBe(false);
    expect(result.gate).toEqual({ mode: 'human_pick', selected: [] });
    expect(result.proposals.length).toBe(2);
    expect(result.source_kind).toBe('directory_csv');
    expect(result.metadata?.invite_new_count).toBe(2);
  });
});

describe('inviteFromDirectory selection gate', () => {
  function mockHttp(captured: { path?: string; body?: unknown }): LoxtepHttpClient {
    return {
      post: async (path: string, body?: unknown) => {
        captured.path = path;
        captured.body = body;
        return {
          success: true,
          data: {
            invited: [{ email: 'a@x.com', invitation_id: 'inv-1', role: 'viewer' }],
            failures: [],
            metadata: {
              total_requested: 1,
              invited_count: 1,
              failure_count: 0,
            },
          },
        };
      },
    } as unknown as LoxtepHttpClient;
  }

  it('refuses empty selection (never auto-invite all)', async () => {
    const captured: { path?: string; body?: unknown } = {};
    await expect(
      inviteFromDirectory(
        { http: mockHttp(captured), organization_id: 'org-1' },
        { emails: [], proposals: proposeInvitees(parseDirectoryCsv({ csv_data: 'email\na@x.com\n' })) }
      )
    ).rejects.toThrow(/explicit selection/i);
    expect(captured.path).toBeUndefined();
  });

  it('invites only the selected email when proposals provided', async () => {
    const captured: { path?: string; body?: unknown } = {};
    const people = parseDirectoryCsv({
      csv_data: 'email\na@x.com\nb@x.com\nc@x.com\n',
    });
    const proposals = proposeInvitees(people);
    const result = await inviteFromDirectory(
      { http: mockHttp(captured), organization_id: 'org-1' },
      { emails: ['a@x.com'], proposals, role: 'viewer' }
    );
    expect(captured.path).toContain('/members/bulk-invite');
    const body = captured.body as { invitations: Array<{ email: string }> };
    expect(body.invitations.map((i) => i.email)).toEqual(['a@x.com']);
    expect(result.invited).toHaveLength(1);
    expect(result.skipped_unselected?.length).toBe(2);
  });

  it('does not invite unselected rows even if disposition is invite_new', async () => {
    const captured: { path?: string; body?: unknown } = {};
    const people = parseDirectoryCsv({
      csv_data: 'email\na@x.com\nb@x.com\n',
    });
    const proposals = proposeInvitees(people);
    await inviteFromDirectory(
      { http: mockHttp(captured), organization_id: 'org-1' },
      { selected: [proposals[0].candidate.fingerprint], proposals }
    );
    const body = captured.body as { invitations: Array<{ email: string }> };
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0].email).toBe('a@x.com');
  });
});
