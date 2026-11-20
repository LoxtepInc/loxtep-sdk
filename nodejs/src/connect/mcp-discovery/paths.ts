/**
 * Candidate MCP config paths per IDE (mcporter-style merge order).
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { McpDiscoverySource } from './types.js';

export const DEFAULT_DISCOVERY_SOURCES: McpDiscoverySource[] = [
  'cursor',
  'claude-code',
  'claude-desktop',
  'codex',
  'vscode',
  'mcporter',
];

export interface PathResolveOptions {
  cwd?: string;
  home_dir?: string;
}

function home(opts: PathResolveOptions): string {
  return opts.home_dir ?? homedir();
}

function cwd(opts: PathResolveOptions): string {
  return opts.cwd ?? process.cwd();
}

/**
 * Ordered candidate files for a source. First name wins across files/kinds.
 */
export function pathsForSource(
  source: McpDiscoverySource,
  opts: PathResolveOptions = {}
): string[] {
  const h = home(opts);
  const c = cwd(opts);
  switch (source) {
    case 'cursor':
      return [
        join(c, '.cursor', 'mcp.json'),
        join(h, '.cursor', 'mcp.json'),
        join(h, '.config', 'Cursor', 'User', 'mcp.json'),
      ];
    case 'claude-code':
      return [
        join(c, '.claude', 'settings.local.json'),
        join(c, '.claude', 'settings.json'),
        join(c, '.claude', 'mcp.json'),
        join(h, '.claude', 'settings.local.json'),
        join(h, '.claude', 'settings.json'),
        join(h, '.claude', 'mcp.json'),
        join(h, '.claude.json'),
      ];
    case 'claude-desktop':
      return [
        join(h, '.config', 'Claude', 'claude_desktop_config.json'),
        join(h, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        join(h, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
      ];
    case 'codex':
      return [join(c, '.codex', 'config.toml'), join(h, '.codex', 'config.toml')];
    case 'vscode':
      return [
        join(c, '.vscode', 'mcp.json'),
        join(c, '.mcp.json'),
        join(h, '.config', 'Code', 'User', 'mcp.json'),
        join(h, '.config', 'Code - Insiders', 'User', 'mcp.json'),
        join(h, '.copilot', 'mcp-config.json'),
      ];
    case 'mcporter': {
      const xdg = process.env.XDG_CONFIG_HOME
        ? join(process.env.XDG_CONFIG_HOME, 'mcporter')
        : join(h, '.config', 'mcporter');
      return [
        join(c, 'config', 'mcporter.json'),
        join(c, 'config', 'mcporter.jsonc'),
        join(xdg, 'mcporter.json'),
        join(xdg, 'mcporter.jsonc'),
        join(h, '.mcporter', 'mcporter.json'),
        join(h, '.mcporter', 'mcporter.jsonc'),
      ];
    }
    default:
      return [];
  }
}
