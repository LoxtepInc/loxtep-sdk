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
