/**
 * Stable fingerprint for discovered MCP servers (no secrets).
 */

import { hashFingerprintMaterial } from '../discovery/fingerprint.js';
import type { McpTransport } from './types.js';

function canonicalizeHttpUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Hash transport + canonical endpoint. Never includes headers, env, or tokens.
 */
export function fingerprintMcpServer(input: {
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
}): string {
  let endpoint: string;
  if (input.transport === 'http' || input.transport === 'sse') {
    endpoint = input.url ? canonicalizeHttpUrl(input.url) : '';
  } else {
    const cmd = (input.command ?? '').trim();
    const args = (input.args ?? []).map((a) => a.trim()).filter(Boolean);
    endpoint = [cmd, ...args].join('\0');
  }
  return hashFingerprintMaterial(`${input.transport}:${endpoint}`);
}
