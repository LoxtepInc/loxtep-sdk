/** Agent-led hosted MCP onboarding. Does not log in to the SDK or create credentials. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { SETUP_PROMPT } from '../setup-prompt.js';

const MCP_URL = 'https://mcp.loxtep.io/ai/mcp/stream';
const CLIENTS = { claude: 'claude', codex: 'codex', opencode: 'opencode', cursor: 'cursor-agent' } as const;
export type StartClient = keyof typeof CLIENTS;
const SKILLS = ['loxtep-mcp-session', 'loxtep-auth', 'connect-external-system', 'data-workflows'];
export function supportedNode(version: string): boolean {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 20);
}
export function detectClient(
  cwd: string, env: NodeJS.ProcessEnv, available: (command: string) => boolean,
  explicit?: string,
): StartClient {
  if (explicit) {
    if (!(explicit in CLIENTS)) throw new Error('Supported clients: claude, codex, opencode, cursor.');
    if (!available(CLIENTS[explicit as StartClient])) throw new Error(`Install ${CLIENTS[explicit as StartClient]} first.`);
    return explicit as StartClient;
  }
  const active = env.CLAUDECODE ? 'claude' : env.CODEX_THREAD_ID ? 'codex' : env.CURSOR_TRACE_ID ? 'cursor' : undefined;
  if (active && available(CLIENTS[active])) return active;
  const installed = (Object.keys(CLIENTS) as StartClient[]).filter(c => available(CLIENTS[c]));
  const hinted = installed.filter(c => existsSync(join(cwd, c === 'opencode' ? 'opencode.json' : `.${c}`)));
  if (hinted.length === 1) return hinted[0];
  if (installed.length === 1) return installed[0];
  throw new Error(installed.length ? 'Multiple agents detected. Run loxtep start --client claude|codex|opencode|cursor.' : 'Install a supported coding agent, then run loxtep start again.');
}

/** Refuse conflicting entries rather than silently replacing credentials or local servers. */
export function mergeMcpConfig(text: string, client: 'cursor' | 'opencode' | 'claude'): string {
  const config = JSON.parse(text) as Record<string, any>;
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('MCP configuration must be a JSON object.');
  const key = client === 'opencode' ? 'mcp' : 'mcpServers';
  if (config[key] && (typeof config[key] !== 'object' || Array.isArray(config[key]))) throw new Error(`Invalid ${key} configuration.`);
  const servers = config[key] ?? {};
  const current = servers.loxtep;
  if (current) {
    if (current.url !== MCP_URL || current.command || current.enabled === false || (client === 'opencode' && current.type !== 'remote') || (client === 'claude' && current.type !== 'http')) {
      throw new Error('An incompatible Loxtep MCP entry already exists. Review it before running start again.');
    }
    return text;
  }
  config[key] = { ...servers, loxtep: client === 'opencode' ? { type: 'remote', url: MCP_URL, enabled: true } : client === 'claude' ? { type: 'http', url: MCP_URL } : { url: MCP_URL } };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export interface StartOptions {
  client?: string;
  noLaunch?: boolean;
  cwd?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
  available?: (command: string) => boolean;
  run?: (command: string, args: string[]) => void;
  log?: (message: string) => void;
}
export function runStart(options: StartOptions = {}): void {
  if (!supportedNode(options.nodeVersion ?? process.versions.node)) throw new Error('Loxtep start requires Node.js 22.20 or newer. Select a supported Node version and retry.');
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const log = options.log ?? console.log;
  const available = options.available ?? ((command: string) => (env.PATH ?? '').split(delimiter).some(p => existsSync(join(p, process.platform === 'win32' ? `${command}.cmd` : command))));
  const run = options.run ?? ((command: string, args: string[]) => {
    const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} did not finish successfully. Retry loxtep start after resolving the error.`);
  });
  const client = detectClient(cwd, env, available, options.client);
  log(`Configuring ${client} for Loxtep hosted MCP. Browser sign-in is required; no token copy/paste.`);
  const skillsPresent = SKILLS.every(skill => [
    join(cwd, '.agents/skills', skill, 'SKILL.md'),
    join(home, '.agents/skills', skill, 'SKILL.md'),
    join(cwd, `.${client}/skills`, skill, 'SKILL.md'),
  ].some(existsSync));
  const claudeHome = env.CLAUDE_CONFIG_DIR ?? join(home, '.claude');
  const settingsPath = join(claudeHome, 'settings.json');
  const settings = client === 'claude' && existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
  const nativeClaudeEnabled = settings.enabledPlugins?.['loxtep-claude@loxtep'] === true;
  const useClaudePlugin = client === 'claude' && (nativeClaudeEnabled || !skillsPresent);
  // Validate configuration before installing anything.
  let path: string | undefined;
  let previous: string | undefined;
  let updated: string | undefined;
  let codexConfigured = false;
  if (client === 'cursor' || client === 'opencode' || (client === 'claude' && !useClaudePlugin)) {
    path = join(cwd, client === 'cursor' ? '.cursor/mcp.json' : client === 'claude' ? '.mcp.json' : 'opencode.json');
    if (client === 'opencode' && existsSync(join(cwd, 'opencode.jsonc'))) throw new Error('This project uses opencode.jsonc. Follow setup.md to merge the hosted entry without losing comments.');
    previous = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    updated = mergeMcpConfig(previous ?? '{}', client);
  } else if (client === 'codex') {
    const configPath = join(env.CODEX_HOME ?? join(home, '.codex'), 'config.toml');
    const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
    const section = config.match(/^\[mcp_servers\.loxtep\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m);
    if (section) {
      codexConfigured = /^url\s*=\s*["']https:\/\/mcp\.loxtep\.io\/ai\/mcp\/stream["']\s*$/m.test(section[1]) && !/^command\s*=/m.test(section[1]) && !/^enabled\s*=\s*false/m.test(section[1]);
      if (!codexConfigured) throw new Error('An incompatible Loxtep MCP entry exists in Codex config. Review it before running start again.');
    } else if (/mcp_servers[^\n]*loxtep/.test(config)) {
      throw new Error('Loxtep uses a nonstandard TOML entry. Follow setup.md to review it before running start again.');
    }
  }
  if (useClaudePlugin) {
    log('Installing the native Loxtep Claude plugin (skills and MCP together) in Claude settings.');
    // Marketplace add is not idempotent, so check the persisted marketplace first.
    const marketplaces = join(claudeHome, 'plugins/known_marketplaces.json');
    const known = existsSync(marketplaces) ? JSON.parse(readFileSync(marketplaces, 'utf8')) : {};
    if (!known.loxtep) run('claude', ['plugin', 'marketplace', 'add', 'LoxtepInc/loxtep-plugins-skills']);
    if (settings.enabledPlugins?.['loxtep-claude@loxtep'] !== true) run('claude', ['plugin', 'install', 'loxtep-claude@loxtep']);
    else log('Reusing the enabled Loxtep Claude plugin.');
  } else {
    if (skillsPresent) log('Reusing installed Loxtep skills.');
    else {
      log('Installing Loxtep skills into this project; the hosted MCP configuration is installed separately.');
      run('npx', ['--yes', 'skills', 'add', 'LoxtepInc/loxtep-plugins-skills', ...SKILLS.flatMap(s => ['--skill', s]), '-a', client === 'claude' ? 'claude-code' : client, '-y']);
    }
    if (client === 'codex' && !codexConfigured) {
      log('Adding Loxtep hosted MCP to Codex user configuration.');
      run('codex', ['mcp', 'add', 'loxtep', '--url', MCP_URL]);
    }
    if (path && updated !== previous) {
      log(`Updating ${path} to add hosted Loxtep MCP while preserving other servers.`);
      mkdirSync(dirname(path), { recursive: true });
      if (previous !== undefined) writeFileSync(`${path}.loxtep-backup-${Date.now()}`, previous, { mode: 0o600, flag: 'wx' });
      const temporary = `${path}.loxtep-${process.pid}.tmp`;
      writeFileSync(temporary, updated!, { mode: 0o600, flag: 'wx' });
      renameSync(temporary, path);
    }
  }
  if (options.noLaunch) {
    log('Configuration complete. Restart your agent if already open, then paste this exact setup prompt:');
    log(SETUP_PROMPT);
    return;
  }
  log(`Launching ${client}. Complete its hosted MCP sign-in when prompted. If interrupted, rerun loxtep start --client ${client}.`);
  run(CLIENTS[client], client === 'opencode' ? ['--prompt', SETUP_PROMPT] : [SETUP_PROMPT]);
}
