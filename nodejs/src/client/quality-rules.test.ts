import { createQualityRulesApi } from './quality-rules.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('quality rules', () => {
  it('gets a rule by scanning the list', async () => {
    const http = {
      get: jest.fn(async (path: string) => {
        expect(path).toContain('/dataproducts/quality-rules');
        if (!path.includes('data_product_id=dp-1')) {
          return { data: { quality_rules: [] } };
        }
        return {
          data: {
            quality_rules: [{ quality_rule_id: 'rule-1', name: 'required event_type', rule_type: 'completeness' }],
          },
        };
      }),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as LoxtepHttpClient;
    const api = createQualityRulesApi(http);
    const rule = await api.get('rule-1', { data_product_id: 'dp-1' });
    expect(rule).toMatchObject({ quality_rule_id: 'rule-1' });
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining('data_product_id=dp-1'));
    await expect(api.get('missing')).rejects.toMatchObject({ code: 'not_in_list' });
  });

  it('creates and updates on the quality-rules collection', async () => {
    const http = {
      get: jest.fn(),
      post: jest.fn(async () => ({ data: { quality_rule_id: 'rule-2' } })),
      put: jest.fn(async () => ({ data: { quality_rule_id: 'rule-2', threshold: 90 } })),
      delete: jest.fn(async () => ({ data: { deleted: true } })),
    } as unknown as LoxtepHttpClient;
    const api = createQualityRulesApi(http);
    await api.create({
      data_product_id: 'dp-1',
      name: 'present',
      rule_type: 'uniqueness',
      condition: 'count > 0',
      threshold: 100,
      severity: 'high',
    });
    expect(http.post).toHaveBeenCalledWith(
      '/dataproducts/quality-rules',
      expect.objectContaining({ rule_type: 'uniqueness' })
    );
    await api.update('rule-2', { threshold: 90 });
    expect(http.put).toHaveBeenCalledWith('/dataproducts/quality-rules/rule-2', { threshold: 90 });
  });
});

describe('quality rule suggestions', () => {
  const DP = 'dp-1';
  const base = `/dataproducts/dataproducts/${DP}/quality/suggestions`;
  function http() {
    return {
      get: jest.fn(async () => ({ data: { run_id: 'run-1', suggestions: [] } })),
      post: jest.fn(async () => ({ data: { requested: true } })),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as LoxtepHttpClient & { get: jest.Mock; post: jest.Mock };
  }

  it('requests, reads, and decides on the suggestions routes', async () => {
    const h = http();
    const api = createQualityRulesApi(h).suggestions;
    expect(await api.request(DP)).toEqual({ requested: true });
    expect(h.post).toHaveBeenCalledWith(base, {});
    expect(await api.get(DP)).toEqual({ run_id: 'run-1', suggestions: [] });
    expect(h.get).toHaveBeenCalledWith(base);
    await api.decide(DP, {
      run_id: 'run-1',
      suggestion_key: 'email_completeness',
      action: 'accept',
      overrides: { threshold: 99 },
    });
    expect(h.post).toHaveBeenLastCalledWith(`${base}/decide`, {
      run_id: 'run-1',
      suggestion_key: 'email_completeness',
      action: 'accept',
      overrides: { threshold: 99 },
    });
  });

  it('rejects overrides on dismiss and a missing product id', async () => {
    const api = createQualityRulesApi(http()).suggestions;
    await expect(
      api.decide(DP, { run_id: 'r', suggestion_key: 'k', action: 'dismiss', overrides: { threshold: 1 } })
    ).rejects.toThrow(/only allowed with action accept/);
    await expect(api.get('')).rejects.toThrow(/data_product_id is required/);
  });
});
