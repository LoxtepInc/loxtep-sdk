/**
 * CLI: loxtep connect discover [--apply] [--include-stdio] [--json]
 *
 * Local MCP discovery → propose connectors → optional pending_auth create + auth issues.
 */

import { createCliClient, requireCliClient } from '../create-cli-client.js';
import {
  discoverLocalMcps,
  proposeConnectors,
  type ConnectorProposal,
  type DiscoverResult,
} from '../../connect/mcp-discovery/index.js';

export interface ConnectDiscoverCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

function printTable(proposals: ConnectorProposal[]): void {
  if (proposals.length === 0) {
    console.log('No MCP servers discovered.');
    return;
  }
  const rows = proposals.map((p) => ({
    name: p.display_name,
    disposition: p.disposition,
    type: p.connector_type,
    ingest_fit: p.ingest_fit,
    transport: p.discovered.transport,
    origin: p.discovered.origin,
    reason: p.reason,
  }));
  const cols = ['name', 'disposition', 'type', 'ingest_fit', 'transport'] as const;
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
  for (const row of rows) {
    console.log(`• ${row.name}: ${row.reason}`);
  }
}

function printApplySummary(result: DiscoverResult): void {
  console.log(
    `Proposals: ${result.proposals.length}  created/reused: ${result.created.length}  skipped: ${result.skipped.length}`
  );
  for (const c of result.created) {
    const reuse = c.reused ? ' (reused)' : '';
    const issue = c.issue_id ? ` issue=${c.issue_id}` : '';
    console.log(
      `  + ${c.proposal.display_name} → connector ${c.connector_id}${reuse}${issue}`
    );
  }
  for (const s of result.skipped) {
    console.log(`  - ${s.display_name} [${s.disposition}] ${s.reason}`);
  }
}

/**
 * Run `loxtep connect discover`.
 * Dry-run works without auth (local files only). `--apply` requires a logged-in client.
 */
export async function runConnectDiscover(
  params: {
    apply?: boolean;
    include_stdio?: boolean;
    json?: boolean;
  } = {},
  options: ConnectDiscoverCmdOptions = {}
): Promise<void> {
  const apply = params.apply === true;
  const include_stdio = params.include_stdio === true;
  const asJson = params.json === true;

  try {
    if (!apply) {
      // Dry-run is local-first (no auth required). When logged in, prefer the
      // client path so map_existing can see org connectors.
      let result: DiscoverResult;
      const authed = await createCliClient(options);
      if (authed) {
        result = await authed.client.connect.discovery.discoverAndPropose({
          apply: false,
          include_stdio,
        });
      } else {
        const discovered = await discoverLocalMcps({ include_stdio });
        const proposals = proposeConnectors(discovered, { include_stdio });
        result = {
          proposals,
          created: [],
          skipped: proposals.filter((p) => p.disposition !== 'create_connector'),
        };
      }
      if (asJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printTable(result.proposals);
        const wouldCreate = result.proposals.filter(
          (p) => p.disposition === 'create_connector'
        ).length;
        console.log(
          `(dry-run) ${wouldCreate} would create; pass --apply to create pending_auth connectors + auth issues`
        );
      }
      return;
    }

    const { client } = await requireCliClient(options);
    const result = await client.connect.discovery.discoverAndPropose({
      apply: true,
      include_stdio,
      open_auth_issues: true,
      assignee: 'human',
    });
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTable(result.proposals);
      printApplySummary(result);
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
