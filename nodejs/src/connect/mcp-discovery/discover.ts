/**
 * discoverLocalMcps — read IDE MCP configs and return DiscoveredMcpServer[].
 */

import { readFile } from 'node:fs/promises';
import { fingerprintMcpServer } from './fingerprint.js';
import { parseConfigFile } from './parse-config.js';
import {
  DEFAULT_DISCOVERY_SOURCES,
  pathsForSource,
} from './paths.js';
import type {
  DiscoveredMcpServer,
  DiscoverLocalMcpsOptions,
  McpDiscoverySource,
} from './types.js';

async function tryRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Discover MCP servers from local IDE configs (Cursor, Claude, Codex, VS Code, mcporter).
 * First name wins across sources (mcporter-style). Auth probe is best-effort → unknown.
 */
export async function discoverLocalMcps(
  opts: DiscoverLocalMcpsOptions = {}
): Promise<DiscoveredMcpServer[]> {
  const sources: McpDiscoverySource[] =
    opts.sources && opts.sources.length > 0
      ? opts.sources
      : DEFAULT_DISCOVERY_SOURCES;
  const includeStdio = opts.include_stdio === true;
  const pathOpts = { cwd: opts.cwd, home_dir: opts.home_dir };

  const byName = new Map<string, DiscoveredMcpServer>();

  // mcporter local overrides should win: process other sources first, then mcporter last
  // so mcporter replaces. Spec: "Local mcporter mcpServers always beat imports."
  const ordered = [
    ...sources.filter((s) => s !== 'mcporter'),
    ...(sources.includes('mcporter') ? (['mcporter'] as const) : []),
  ];

  for (const source of ordered) {
    const paths = pathsForSource(source, pathOpts);
    for (const filePath of paths) {
      const contents = await tryRead(filePath);
      if (contents == null) continue;
      const entries = parseConfigFile(filePath, contents);
      for (const entry of entries) {
        if (entry.transport === 'stdio' && !includeStdio) {
          // Still record as skippable discovery when include_stdio is false?
          // Spec: discover returns DiscoveredMcpServer[]; propose skips stdio.
          // Include them so propose can mark skip with reason — but brief says
          // "stdio skip unless include_stdio". Discover can still return them;
          // propose skips. Prefer returning only when include_stdio for cloud path
          // clarity: return them always so dry-run shows skips.
        }
        const fingerprint = fingerprintMcpServer({
          transport: entry.transport,
          url: entry.url,
          command: entry.command,
          args: entry.args,
        });
        const discovered: DiscoveredMcpServer = {
          name: entry.name,
          transport: entry.transport,
          origin: `${source}:${filePath}`,
          auth_state: 'unknown',
          fingerprint,
          ...(entry.url ? { url: entry.url } : {}),
          ...(entry.command ? { command: entry.command } : {}),
          ...(entry.args ? { args: entry.args } : {}),
        };

        if (source === 'mcporter') {
          byName.set(entry.name, discovered);
        } else if (!byName.has(entry.name)) {
          byName.set(entry.name, discovered);
        }
      }
    }
  }

  let servers = [...byName.values()];
  if (!includeStdio) {
    // Keep stdio in the list so propose can disposition=skip; callers filtering
    // for apply still won't create. Spec discoverLocalMcps include_stdio default
    // false for cloud-ingest path — return non-stdio only when false.
    servers = servers.filter((s) => s.transport !== 'stdio');
  }
  return servers;
}
