import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { discoverLocalMcps } from './discover.js';
import { fingerprintMcpServer } from './fingerprint.js';
import {
  extractServersFromJson,
  extractServersFromToml,
  parseConfigFile,
} from './parse-config.js';
import {
  proposeConnectors,
  classifyDiscoveredServer,
  shouldAutoCreate,
} from './propose.js';
import type { DiscoveredMcpServer } from './types.js';

const FIXTURES = join(__dirname, '__fixtures__');

describe('mcp-discovery parse + fingerprint', () => {
  it('parses Cursor mcpServers (url + stdio) and drops secrets', () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES, 'cursor-mcp.json'), 'utf8')
    );
    const entries = extractServersFromJson(raw);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual([
      'action-writer',
      'github',
      'loxtep',
      'shopify-store',
    ]);
    const shopify = entries.find((e) => e.name === 'shopify-store')!;
    expect(shopify.transport).toBe('http');
    expect(shopify.url).toContain('shopify.com');
    const github = entries.find((e) => e.name === 'github')!;
    expect(github.transport).toBe('stdio');
    expect(github.command).toBe('npx');
    expect(JSON.stringify(github)).not.toContain('secret');
  });

  it('parses VS Code servers map with type http/sse/stdio', () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES, 'vscode-mcp.json'), 'utf8')
    );
    const entries = extractServersFromJson(raw);
    expect(entries.find((e) => e.name === 'stripe-mcp')?.transport).toBe('sse');
    expect(entries.find((e) => e.name === 'local-fs')?.transport).toBe('stdio');
  });

  it('parses Codex TOML mcp_servers', () => {
    const toml = `
[mcp_servers.loxtep]
url = "https://mcp.loxtep.io/ai/mcp/stream"

[mcp_servers.tools]
command = "npx"
args = ["-y", "foo"]
`;
    const entries = extractServersFromToml(toml);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.name === 'loxtep')?.url).toContain('loxtep.io');
    expect(entries.find((e) => e.name === 'tools')?.command).toBe('npx');
  });

  it('fingerprints http without query/secrets and is stable', () => {
    const a = fingerprintMcpServer({
      transport: 'http',
      url: 'https://Example.com/mcp/?token=secret',
    });
    const b = fingerprintMcpServer({
      transport: 'http',
      url: 'https://example.com/mcp',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });
});

describe('discoverLocalMcps fixtures', () => {
  it('discovers Cursor + VS Code project configs (HTTP/SSE only by default)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'loxtep-mcp-disc-'));
    await mkdir(join(root, '.cursor'), { recursive: true });
    await mkdir(join(root, '.vscode'), { recursive: true });
    await writeFile(
      join(root, '.cursor', 'mcp.json'),
      readFileSync(join(FIXTURES, 'cursor-mcp.json'))
    );
    await writeFile(
      join(root, '.vscode', 'mcp.json'),
      readFileSync(join(FIXTURES, 'vscode-mcp.json'))
    );

    const discovered = await discoverLocalMcps({
      cwd: root,
      home_dir: join(root, 'no-home'),
      sources: ['cursor', 'vscode'],
    });

    const names = discovered.map((d) => d.name).sort();
    // First name wins: cursor before vscode for "loxtep"
    expect(names).toContain('loxtep');
    expect(names).toContain('shopify-store');
    expect(names).toContain('stripe-mcp');
    expect(names).toContain('action-writer');
    // stdio filtered by default
    expect(names).not.toContain('github');
    expect(names).not.toContain('local-fs');

    const loxtep = discovered.find((d) => d.name === 'loxtep')!;
    expect(loxtep.origin.startsWith('cursor:')).toBe(true);
    expect(loxtep.fingerprint).toBeTruthy();
    expect(JSON.stringify(discovered)).not.toContain('secret');
  });

  it('include_stdio returns stdio servers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'loxtep-mcp-stdio-'));
    await mkdir(join(root, '.cursor'), { recursive: true });
    await writeFile(
      join(root, '.cursor', 'mcp.json'),
      readFileSync(join(FIXTURES, 'cursor-mcp.json'))
    );
    const discovered = await discoverLocalMcps({
      cwd: root,
      home_dir: join(root, 'no-home'),
      sources: ['cursor'],
      include_stdio: true,
    });
    expect(discovered.map((d) => d.name)).toContain('github');
  });
});

describe('proposeConnectors classify', () => {
  function server(
    partial: Partial<DiscoveredMcpServer> & Pick<DiscoveredMcpServer, 'name' | 'transport'>
  ): DiscoveredMcpServer {
    return {
      origin: 'test:fixture',
      auth_state: 'unknown',
      fingerprint: fingerprintMcpServer({
        transport: partial.transport,
        url: partial.url,
        command: partial.command,
        args: partial.args,
      }),
      ...partial,
    };
  }

  it('maps shopify name to create_connector with high ingest_fit', () => {
    const p = classifyDiscoveredServer(
      server({
        name: 'shopify-store',
        transport: 'http',
        url: 'https://mcp.shopify.com/x',
      })
    );
    expect(p.disposition).toBe('create_connector');
    expect(p.connector_type).toBe('shopify');
    expect(p.ingest_fit).toBe('high');
  });

  it('marks write-only toolsets as action_only', () => {
    const p = classifyDiscoveredServer(
      server({
        name: 'action-writer',
        transport: 'http',
        url: 'https://actions.example.com/mcp',
        tool_names: ['create_order', 'update_order', 'delete_order'],
      })
    );
    expect(p.disposition).toBe('action_only');
  });

  it('skips stdio unless include_stdio', () => {
    const skip = classifyDiscoveredServer(
      server({ name: 'github', transport: 'stdio', command: 'npx' })
    );
    expect(skip.disposition).toBe('skip');

    const withFlag = classifyDiscoveredServer(
      server({ name: 'github', transport: 'stdio', command: 'npx' }),
      { include_stdio: true }
    );
    expect(withFlag.disposition).toBe('skip');
    expect(withFlag.reason).toMatch(/local agent/);
  });

  it('maps existing connector by fingerprint', () => {
    const discovered = server({
      name: 'stripe-mcp',
      transport: 'sse',
      url: 'https://mcp.stripe.com/sse',
    });
    const proposals = proposeConnectors([discovered], {
      existing_connectors: [
        {
          connector_id: 'conn-1',
          connector_type: 'stripe',
          metadata: {
            name: 'Stripe Mcp',
            discovery: { fingerprint: discovered.fingerprint },
          },
        },
      ],
    });
    expect(proposals[0].disposition).toBe('map_existing');
    expect(proposals[0].existing_connector_id).toBe('conn-1');
  });

  it('labels generic HTTP MCP as mcp-http create (never rest-api)', () => {
    const p = classifyDiscoveredServer(
      server({
        name: 'custom-http',
        transport: 'http',
        url: 'https://example.com/mcp',
        tool_names: ['list_items', 'get_item'],
      })
    );
    expect(p.disposition).toBe('create_connector');
    expect(p.connector_type).toBe('mcp-http');
    expect(p.connector_type).not.toBe('rest-api');
    expect(p.reason).toMatch(/mcp-http relay/i);
  });

  it('auto-creates first-party and mcp-http (flag on); mcp-http off when flag disabled', () => {
    const shopify = classifyDiscoveredServer(
      server({
        name: 'shopify-store',
        transport: 'http',
        url: 'https://mcp.shopify.com/x',
      })
    );
    const generic = classifyDiscoveredServer(
      server({
        name: 'custom-http',
        transport: 'http',
        url: 'https://example.com/mcp',
        tool_names: ['list_items'],
      })
    );
    expect(shopify.disposition).toBe('create_connector');
    expect(shouldAutoCreate(shopify)).toBe(true);
    expect(generic.disposition).toBe('create_connector');
    expect(generic.connector_type).toBe('mcp-http');
    const prev = process.env.LOXTEP_MCP_HTTP_APPLY;
    try {
      delete process.env.LOXTEP_MCP_HTTP_APPLY;
      expect(shouldAutoCreate(generic)).toBe(true);
      process.env.LOXTEP_MCP_HTTP_APPLY = '0';
      expect(shouldAutoCreate(generic)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.LOXTEP_MCP_HTTP_APPLY;
      else process.env.LOXTEP_MCP_HTTP_APPLY = prev;
    }
  });
});

describe('parseConfigFile', () => {
  it('reads fixture paths', () => {
    const cursor = parseConfigFile(
      join(FIXTURES, 'cursor-mcp.json'),
      readFileSync(join(FIXTURES, 'cursor-mcp.json'), 'utf8')
    );
    expect(cursor.length).toBeGreaterThan(0);
  });
});
