/**
 * CLI: loxtep team directory discover [--csv <path>] [--connector-id <id>] [--json]
 *
 * Directory invite discovery dry-run (propose only). Never invites.
 */

import { readFile } from 'node:fs/promises';
import { createCliClient, requireCliClient } from '../create-cli-client.js';
import type { InviteProposal } from '../../team/directory-discovery/index.js';

export interface TeamDirectoryCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

function printTable(proposals: InviteProposal[]): void {
  if (proposals.length === 0) {
    console.log('No directory people discovered.');
    return;
  }
  const rows = proposals.map((p) => ({
    name: p.display_name,
    email: String(p.candidate.payload.email ?? ''),
    disposition: p.disposition,
    suggested: p.annotations?.suggested ? 'yes' : '',
    reason: p.reason,
  }));
  const cols = ['name', 'email', 'disposition', 'suggested'] as const;
  const widths = Object.fromEntries(
    cols.map((c) => [
      c,
      Math.max(c.length, ...rows.map((r) => String(r[c]).length)),
    ])
  ) as Record<(typeof cols)[number], number>;
  const header = cols.map((c) => c.padEnd(widths[c])).join('  ');
  console.log(header);
  console.log(cols.map((c) => '-'.repeat(widths[c])).join('  '));
  for (const row of rows) {
    console.log(cols.map((c) => String(row[c]).padEnd(widths[c])).join('  '));
  }
  console.log('');
  console.log(
    'Gate: human_pick (selection empty). Invite only via inviteFromDirectory with explicit emails.'
  );
  for (const row of rows) {
    console.log(`• ${row.email || row.name}: ${row.reason}`);
  }
}

/**
 * Run `loxtep team directory discover` (dry-run propose only).
 */
export async function runTeamDirectoryDiscover(
  params: {
    csv?: string;
    connector_id?: string;
    org_email_domain?: string;
    json?: boolean;
  } = {},
  options: TeamDirectoryCmdOptions = {}
): Promise<void> {
  try {
    if (!params.csv && !params.connector_id) {
      console.error(
        'Provide --csv <path> and/or --connector-id <uuid> for directory discover.'
      );
      process.exitCode = 1;
      return;
    }

    let csv_data: string | undefined;
    if (params.csv) {
      csv_data = await readFile(params.csv, 'utf8');
    }

    // CSV-only can propose locally without platform; connector roster needs auth.
    let client;
    if (params.connector_id) {
      ({ client } = await requireCliClient(options));
    } else {
      const authed = await createCliClient(options);
      if (authed) {
        client = authed.client;
      } else {
        // Offline CSV propose via local pipeline (no org member annotations).
        const { discoverDirectoryPeople } = await import(
          '../../team/directory-discovery/index.js'
        );
        const result = await discoverDirectoryPeople(
          {},
          {
            csv_data,
            org_email_domain: params.org_email_domain,
            use_platform: false,
          }
        );
        if (params.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printTable(result.proposals);
          console.log(
            `\nProposals: ${result.proposals.length} (offline; login for member/pending annotations)`
          );
        }
        return;
      }
    }

    const result = await client.team.directory.discoverDirectoryPeople({
      csv_data,
      connector_id: params.connector_id,
      org_email_domain: params.org_email_domain,
      use_platform: Boolean(params.connector_id) || undefined,
    });

    if (params.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.auth_state === 'needs_auth') {
      console.log(
        `Directory connector ${result.source_connector_id ?? params.connector_id} needs auth. Complete Connect OAuth, then re-run discover.`
      );
      return;
    }

    printTable(result.proposals);
    console.log(
      `\nProposals: ${result.proposals.length}  invite_new: ${result.metadata?.invite_new_count ?? 0}  skip_member: ${result.metadata?.skip_member_count ?? 0}  skip_pending: ${result.metadata?.skip_pending_count ?? 0}`
    );
    console.log(
      'ingest_started: false (roster/CSV discover never starts Products ingest)'
    );
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
