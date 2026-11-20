/**
 * Parse IDE MCP config files into normalized server entries (no secrets retained).
 */

import type { McpTransport } from './types.js';

export interface RawMcpEntry {
  name: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickUrl(entry: Record<string, unknown>): string | undefined {
  for (const key of ['url', 'baseUrl', 'serverUrl', 'server_url', 'base_url']) {
    const v = entry[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickCommand(entry: Record<string, unknown>): {
  command?: string;
  args?: string[];
} {
  const cmd = entry.command;
  if (typeof cmd === 'string' && cmd.trim()) {
    const args = Array.isArray(entry.args)
      ? entry.args.filter((a): a is string => typeof a === 'string')
      : undefined;
    return { command: cmd.trim(), args };
  }
  if (Array.isArray(cmd) && cmd.length > 0 && typeof cmd[0] === 'string') {
    return {
      command: cmd[0],
      args: cmd.slice(1).filter((a): a is string => typeof a === 'string'),
    };
  }
  return {};
}

function inferTransport(
  entry: Record<string, unknown>,
  url?: string
): McpTransport | null {
  const typeRaw = entry.type ?? entry.transport;
  if (typeof typeRaw === 'string') {
    const t = typeRaw.toLowerCase();
    if (t === 'sse' || t === 'http' || t === 'stdio') return t;
    if (t === 'streamable-http' || t === 'streamable_http') return 'http';
  }
  if (url) return 'http';
  if (entry.command) return 'stdio';
  return null;
}

/**
 * Normalize one MCP server entry. Drops headers/env/oauth (never fingerprint secrets).
 */
export function normalizeMcpEntry(
  name: string,
  raw: unknown
): RawMcpEntry | null {
  const entry = asRecord(raw);
  if (!entry) return null;
  const url = pickUrl(entry);
  const { command, args } = pickCommand(entry);
  const transport = inferTransport(entry, url);
  if (!transport) return null;
  if ((transport === 'http' || transport === 'sse') && !url) return null;
  if (transport === 'stdio' && !command) return null;
  return {
    name,
    transport,
    ...(url ? { url } : {}),
    ...(command ? { command } : {}),
    ...(args && args.length ? { args } : {}),
  };
}

/**
 * Extract server map from JSON root: mcpServers | servers | mcp | root map.
 */
export function extractServersFromJson(parsed: unknown): RawMcpEntry[] {
  const root = asRecord(parsed);
  if (!root) return [];

  const containers: Array<Record<string, unknown>> = [];
  for (const key of ['mcpServers', 'servers', 'mcp']) {
    const c = asRecord(root[key]);
    if (c) containers.push(c);
  }
  // Claude Desktop / nested projects may stash mcpServers under projects[path]
  const projects = asRecord(root.projects);
  if (projects) {
    for (const proj of Object.values(projects)) {
      const p = asRecord(proj);
      const nested = p ? asRecord(p.mcpServers) : null;
      if (nested) containers.push(nested);
    }
  }
  // Legacy: root itself is a name→entry map (no wrapper key)
  if (
    containers.length === 0 &&
    Object.values(root).some((v) => asRecord(v) && (pickUrl(asRecord(v)!) || asRecord(v)!.command))
  ) {
    containers.push(root);
  }

  const out: RawMcpEntry[] = [];
  const seen = new Set<string>();
  for (const container of containers) {
    for (const [name, value] of Object.entries(container)) {
      if (seen.has(name)) continue;
      const normalized = normalizeMcpEntry(name, value);
      if (!normalized) continue;
      seen.add(name);
      out.push(normalized);
    }
  }
  return out;
}

/**
 * Minimal TOML extractor for Codex `[mcp_servers.<name>]` tables.
 * Supports url= / command= / args=[...] string values; ignores other keys.
 */
export function extractServersFromToml(text: string): RawMcpEntry[] {
  const lines = text.split(/\r?\n/);
  const sections = new Map<string, Record<string, unknown>>();
  let current: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const header = line.match(/^\[mcp_servers\.([^\]]+)\]$/i);
    if (header) {
      current = header[1];
      if (!sections.has(current)) sections.set(current, {});
      continue;
    }
    if (!current) continue;
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    const section = sections.get(current)!;
    if (val.startsWith('"') && val.endsWith('"')) {
      section[key] = val.slice(1, -1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      section[key] = val.slice(1, -1);
    } else if (val.startsWith('[')) {
      const inner = val.slice(1, val.lastIndexOf(']'));
      section[key] = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      section[key] = val;
    }
  }

  const out: RawMcpEntry[] = [];
  for (const [name, entry] of sections) {
    const normalized = normalizeMcpEntry(name, entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Strip // and /* *\/ comments from JSONC (best-effort). */
export function stripJsoncComments(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  let stringQuote = '';
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === stringQuote) inString = false;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function parseConfigFile(
  path: string,
  contents: string
): RawMcpEntry[] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.toml')) {
    return extractServersFromToml(contents);
  }
  const cleaned = stripJsoncComments(contents);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  return extractServersFromJson(parsed);
}
