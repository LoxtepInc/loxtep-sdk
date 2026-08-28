import { createProcessIntelligenceApi } from './process-intelligence.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createProcessIntelligenceApi list / entity context', () => {
  it('list GETs decision-traces with no query when params empty', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: { items: [], pagination: { page: 1, page_size: 20, total: 0 } },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProcessIntelligenceApi(http);
    await api.decisionTraces.list('org1');
    expect(capturedPath).toBe('/process-intelligence/organizations/org1/decision-traces');

    await api.decisionTraces.list('org1', {});
    expect(capturedPath).toBe('/process-intelligence/organizations/org1/decision-traces');
  });

  it('list builds filter query string', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { items: [] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProcessIntelligenceApi(http);
    await api.decisionTraces.list('org1', {
      correlation_key: 'order_id',
      correlation_value: 'o1',
      decision_point: 'refund.approve',
      is_exception: true,
      precedent: 'prev1',
      page: 2,
      page_size: 50,
    });

    expect(capturedPath).toContain('/process-intelligence/organizations/org1/decision-traces?');
    expect(capturedPath).toContain('correlation_key=order_id');
    expect(capturedPath).toContain('correlation_value=o1');
    expect(capturedPath).toContain('decision_point=refund.approve');
    expect(capturedPath).toContain('is_exception=true');
    expect(capturedPath).toContain('precedent=prev1');
    expect(capturedPath).toContain('page=2');
    expect(capturedPath).toContain('page_size=50');
  });

  it('list sets is_exception=false when boolean false', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { items: [] } };
      },
    } as unknown as LoxtepHttpClient;

    await createProcessIntelligenceApi(http).decisionTraces.list('org1', {
      is_exception: false,
    });
    expect(capturedPath).toContain('is_exception=false');
  });

  it('getEntityContext GETs /context with entity_type and entity_id', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: { entity_type: 'order', entity_id: 'o1', traces: [] },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProcessIntelligenceApi(http);
    const result = await api.getEntityContext('org1', {
      entity_type: 'order',
      entity_id: 'o1',
    });

    expect(capturedPath).toBe(
      '/process-intelligence/organizations/org1/context?entity_type=order&entity_id=o1'
    );
    expect(result.entity_id).toBe('o1');
  });

  it('getChain / getSimilar omit query when params absent', async () => {
    const paths: string[] = [];
    const http = {
      get: async (path: string) => {
        paths.push(path);
        return { success: true as const, data: { seed_trace_id: 't1', nodes: [], hops: [], items: [] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProcessIntelligenceApi(http);
    await api.decisionTraces.getChain('org1', 't1');
    await api.decisionTraces.getSimilar('org1', 't1');
    expect(paths[0]).toBe(
      '/process-intelligence/organizations/org1/decision-traces/t1/chain'
    );
    expect(paths[1]).toBe(
      '/process-intelligence/organizations/org1/decision-traces/t1/similar'
    );
  });
});

describe('createProcessIntelligenceApi LOX-1226', () => {
  it('getChain GETs .../decision-traces/:trace_id/chain with query params', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            seed_trace_id: 't1',
            nodes: ['decision_trace#t1', 'decision_trace#t2'],
            hops: [
              {
                from_trace_id: 't1',
                to_trace_id: 't2',
                relation_type: 'CAUSED',
                direction: 'outgoing',
                depth: 1,
              },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProcessIntelligenceApi(http);
    const result = await api.decisionTraces.getChain('org1', 't1', {
      max_depth: 5,
      direction: 'forward',
    });

    expect(capturedPath).toBe(
      '/process-intelligence/organizations/org1/decision-traces/t1/chain?max_depth=5&direction=forward'
    );
    expect(result.seed_trace_id).toBe('t1');
    expect(result.hops).toHaveLength(1);
    expect(result.hops[0]?.relation_type).toBe('CAUSED');
  });

  it('getSimilar GETs .../decision-traces/:trace_id/similar?limit=', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            seed_trace_id: 't1',
            items: [
              {
                trace_id: 't9',
                decision_point: 'refund.approve',
                decision: 'approve',
                entity_type: 'order',
                entity_id: 'o1',
                is_exception: false,
                precedent_id: null,
                created_at: '2026-08-10T00:00:00Z',
                score: 70,
                match_reasons: ['same_decision_point'],
              },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProcessIntelligenceApi(http);
    const result = await api.decisionTraces.getSimilar('org1', 't1', { limit: 10 });

    expect(capturedPath).toBe(
      '/process-intelligence/organizations/org1/decision-traces/t1/similar?limit=10'
    );
    expect(result.items[0]?.score).toBe(70);
  });

  it('create POSTs entity body with links and precedent_id', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            trace_id: 'new1',
            entity_type: 'order',
            entity_id: 'o1',
            decision_point: 'refund.approve',
            decision: 'approve',
            reason: null,
            is_exception: false,
            precedent_id: 'prev1',
            links: [
              {
                from_trace_id: 'new1',
                to_trace_id: 'target1',
                relation_type: 'INFLUENCED',
              },
            ],
            metadata: null,
            created_at: '2026-08-10T00:00:00Z',
            created_by: 'user1',
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProcessIntelligenceApi(http);
    const result = await api.decisionTraces.create('org1', {
      entity_type: 'order',
      entity_id: 'o1',
      decision_point: 'refund.approve',
      decision: 'approve',
      precedent_id: 'prev1',
      links: [{ target_trace_id: 'target1', relation_type: 'INFLUENCED' }],
    });

    expect(capturedPath).toBe('/process-intelligence/organizations/org1/decision-traces');
    expect(capturedBody).toEqual({
      entity_type: 'order',
      entity_id: 'o1',
      decision_point: 'refund.approve',
      decision: 'approve',
      precedent_id: 'prev1',
      links: [{ target_trace_id: 'target1', relation_type: 'INFLUENCED' }],
    });
    expect(result.trace_id).toBe('new1');
    expect(result.links).toHaveLength(1);
  });
});
