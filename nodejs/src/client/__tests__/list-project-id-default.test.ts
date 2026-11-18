import { LoxtepClient } from '../loxtep-client.js';

describe('list() defaults filters.project_id to the client project_id', () => {
  function captureUrls(): { urls: string[]; client: LoxtepClient } {
    const urls: string[] = [];
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      project_id: 'client-proj',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request) => {
        const u =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : (url as Request).url;
        urls.push(u);
        if (u.includes('/entities')) {
          return new Response(
            JSON.stringify({ success: true, data: { connections: [] } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [],
              pagination: { page: 1, page_size: 100, total: 0, total_pages: 0 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });
    return { urls, client };
  }

  it('workflows.list() with no args uses client.project_id', async () => {
    const { urls, client } = captureUrls();
    await client.build.workflows.list();
    expect(urls[0]).toContain('project_id=client-proj');
  });

  it('workflows.list({ project_id }) keeps the explicit id', async () => {
    const { urls, client } = captureUrls();
    await client.build.workflows.list({ project_id: 'explicit-proj' });
    expect(urls[0]).toContain('project_id=explicit-proj');
    expect(urls[0]).not.toContain('project_id=client-proj');
  });

  it('triggers.list() with no args uses client.project_id', async () => {
    const { urls, client } = captureUrls();
    await client.build.triggers.list();
    expect(urls[0]).toContain('/workflows/projects/client-proj/entities');
  });

  it('triggers.list({ project_id }) keeps the explicit id', async () => {
    const { urls, client } = captureUrls();
    await client.build.triggers.list({ project_id: 'explicit-proj' });
    expect(urls[0]).toContain('/workflows/projects/explicit-proj/entities');
  });

  it('deployments.get() with no project_id uses client.project_id', async () => {
    const { urls, client } = captureUrls();
    await client.workspace.deployments.get('dep-1');
    expect(urls[0]).toContain('/workflows/deployments/dep-1');
    expect(urls[0]).toContain('project_id=client-proj');
  });

  it('deployments.get() keeps an explicit project_id', async () => {
    const { urls, client } = captureUrls();
    await client.observe.get_deployment('dep-1', { project_id: 'explicit-proj' });
    expect(urls[0]).toContain('project_id=explicit-proj');
    expect(urls[0]).not.toContain('project_id=client-proj');
  });

  it('workflows.get() with no args uses client.project_id', async () => {
    const { urls, client } = captureUrls();
    await client.build.workflows.get('flow-1');
    expect(urls[0]).toContain('/workflows/workflows/flow-1?project_id=client-proj');
    expect(urls[1]).toContain('/workflows/workflows/flow-1/nodes?project_id=client-proj');
  });
});
