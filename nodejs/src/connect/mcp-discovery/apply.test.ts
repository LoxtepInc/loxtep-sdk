import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverAndPropose } from './apply.js';
import { fingerprintMcpServer } from './fingerprint.js';

const FIXTURES = join(__dirname, '__fixtures__');

describe('discoverAndPropose apply + idempotency', () => {
  async function fixtureCwd(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'loxtep-mcp-apply-'));
    await mkdir(join(root, '.cursor'), { recursive: true });
    await writeFile(
      join(root, '.cursor', 'mcp.json'),
      readFileSync(join(FIXTURES, 'cursor-mcp.json'))
    );
    return root;
  }

  it('dry-run creates nothing', async () => {
    const cwd = await fixtureCwd();
    const creates: unknown[] = [];
    const result = await discoverAndPropose(
      {
        organization_id: 'org-1',
        connectors: {
          list: async () => ({ items: [] }),
          create: async (input) => {
            creates.push(input);
            return { connector_id: 'should-not' };
          },
        },
      },
      { apply: false, cwd, home_dir: join(cwd, 'no-home'), sources: ['cursor'] }
    );
    expect(creates).toHaveLength(0);
    expect(result.created).toHaveLength(0);
    expect(
      result.proposals.some((p) => p.disposition === 'create_connector')
    ).toBe(true);
  });

  it('apply creates pending_auth connectors without vault secrets + auth issues', async () => {
    const cwd = await fixtureCwd();
    const creates: Array<{ connector_type: string; metadata?: Record<string, unknown> }> =
      [];
    const issues: Array<Record<string, unknown>> = [];
    let n = 0;

    const result = await discoverAndPropose(
      {
        organization_id: 'org-1',
        connectors: {
          list: async () => ({ items: [] }),
          create: async (input) => {
            creates.push(input);
            n += 1;
            return { connector_id: `conn-${n}`, metadata: input.metadata };
          },
          get_oauth_url: async (id) => ({
            oauth_url: `https://oauth.example/${id}`,
          }),
        },
        issues: {
          create: async (input) => {
            issues.push(input);
            return { issue_id: `iss-${issues.length}` };
          },
        },
        resolve_human_user_id: async () => 'user-1',
      },
      {
        apply: true,
        open_auth_issues: true,
        assignee: 'human',
        cwd,
        home_dir: join(cwd, 'no-home'),
        sources: ['cursor'],
      }
    );

    expect(creates.length).toBeGreaterThan(0);
    for (const c of creates) {
      expect(c.metadata?.status).toBe('pending_auth');
      expect((c.metadata?.discovery as { fingerprint?: string })?.fingerprint).toBeTruthy();
      expect(JSON.stringify(c)).not.toContain('secret');
      expect(JSON.stringify(c)).not.toMatch(/Bearer|GITHUB_TOKEN/i);
    }
    expect(issues.length).toBe(creates.length);
    expect(issues[0].title).toMatch(/^Authenticate /);
    expect(issues[0].dedupe_key).toMatch(/^connector-auth:org-1:conn-/);
    expect(issues[0].assignee_user_id).toBe('user-1');
    expect(result.created.every((c) => c.connector_id && c.issue_id)).toBe(true);
  });

  it('second apply is idempotent (fingerprint dedupe)', async () => {
    const cwd = await fixtureCwd();
    const shopifyFp = fingerprintMcpServer({
      transport: 'http',
      url: 'https://mcp.shopify.com/stores/demo',
    });

    let createCalls = 0;
    let issueCalls = 0;
    const existing = [
      {
        connector_id: 'conn-existing',
        connector_type: 'shopify',
        organization_id: 'org-1',
        metadata: {
          name: 'Shopify Store',
          status: 'pending_auth',
          discovery: { fingerprint: shopifyFp, mcp_name: 'shopify-store' },
        },
      },
    ];

    const deps = {
      organization_id: 'org-1',
      connectors: {
        list: async () => ({ items: existing }),
        create: async (input: {
          connector_type: string;
          metadata?: Record<string, unknown>;
        }) => {
          createCalls += 1;
          const id = `conn-new-${createCalls}`;
          existing.push({
            connector_id: id,
            connector_type: input.connector_type,
            organization_id: 'org-1',
            metadata: input.metadata as (typeof existing)[0]['metadata'],
          });
          return { connector_id: id, metadata: input.metadata };
        },
      },
      issues: {
        create: async () => {
          issueCalls += 1;
          return { issue_id: `iss-${issueCalls}` };
        },
      },
    };

    const first = await discoverAndPropose(deps, {
      apply: true,
      cwd,
      home_dir: join(cwd, 'no-home'),
      sources: ['cursor'],
    });
    const createdFirst = first.created.filter((c) => !c.reused).length;
    const reusedFirst = first.created.filter((c) => c.reused).length;
    expect(reusedFirst).toBeGreaterThanOrEqual(1);

    const createsAfterFirst = createCalls;
    const second = await discoverAndPropose(deps, {
      apply: true,
      cwd,
      home_dir: join(cwd, 'no-home'),
      sources: ['cursor'],
    });
    expect(createCalls).toBe(createsAfterFirst);
    expect(second.created.filter((c) => !c.reused)).toHaveLength(0);
    expect(createdFirst).toBe(createsAfterFirst);
  });
});
