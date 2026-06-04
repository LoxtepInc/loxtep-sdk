import {
  validateSkillReferences,
  formatSkillValidationErrors,
} from './validate-references';
import type { SkillDefinition } from './types';
import type { WorkspaceContext } from '../codegen/types';

describe('validateSkillReferences', () => {
  const baseContext: WorkspaceContext = {
    dataProducts: [
      { name: 'orders_raw', id: 'dp_1', domain: 'commerce', schema: null },
      { name: 'orders_enriched', id: 'dp_2', domain: 'commerce', schema: null },
      { name: 'customers', id: 'dp_3', domain: 'crm', schema: null },
    ],
    connectors: [
      { type: 'shopify', id: 'cn_1', connection_id: 'conn_1', name: 'shopify_main' },
      { type: 'stripe', id: 'cn_2', connection_id: 'conn_2', name: 'stripe_payments' },
    ],
    domains: [
      { name: 'commerce', id: 'dm_1', data_product_ids: ['dp_1', 'dp_2'] },
      { name: 'crm', id: 'dm_2', data_product_ids: ['dp_3'] },
    ],
    queues: [
      { name: 'orders_raw', id: 'q_1' },
      { name: 'events_inbound', id: 'q_2' },
    ],
    flows: [
      { name: 'enrich_orders', id: 'fl_1' },
    ],
    workflows: [
      { name: 'order_sync', id: 'wf_1' },
      { name: 'customer_import', id: 'wf_2' },
    ],
  };

  it('returns valid when skills map is empty', () => {
    const skills = new Map<string, SkillDefinition>();
    const result = validateSkillReferences(skills, baseContext);
    expect(result).toEqual({ valid: true });
  });

  it('returns valid when all skill references exist in the context', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('analytics', {
      name: 'analytics',
      scope: {
        data_products: ['orders_raw', 'orders_enriched'],
        connectors: ['shopify_main'],
        domains: ['commerce'],
        queues: ['orders_raw'],
        workflows: ['order_sync'],
      },
      permissions: {
        data_products: ['read'],
        connectors: ['read'],
      },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result).toEqual({ valid: true });
  });

  it('reports missing data product references', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('bad-skill', {
      name: 'bad-skill',
      scope: {
        data_products: ['orders_raw', 'nonexistent_dp'],
      },
      permissions: { data_products: ['read'] },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        skillName: 'bad-skill',
        resourceType: 'data_products',
        missingIdentifier: 'nonexistent_dp',
      });
    }
  });

  it('reports missing connector references', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('conn-skill', {
      name: 'conn-skill',
      scope: {
        connectors: ['shopify_main', 'missing_connector'],
      },
      permissions: { connectors: ['read'] },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        skillName: 'conn-skill',
        resourceType: 'connectors',
        missingIdentifier: 'missing_connector',
      });
    }
  });

  it('reports missing workflow references', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('wf-skill', {
      name: 'wf-skill',
      scope: {
        workflows: ['order_sync', 'ghost_workflow'],
      },
      permissions: { workflows: ['read'] },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        skillName: 'wf-skill',
        resourceType: 'workflows',
        missingIdentifier: 'ghost_workflow',
      });
    }
  });

  it('reports missing domain references', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('domain-skill', {
      name: 'domain-skill',
      scope: {
        domains: ['commerce', 'nonexistent_domain'],
      },
      permissions: { domains: ['read'] },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        skillName: 'domain-skill',
        resourceType: 'domains',
        missingIdentifier: 'nonexistent_domain',
      });
    }
  });

  it('reports missing queue references', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('queue-skill', {
      name: 'queue-skill',
      scope: {
        queues: ['orders_raw', 'missing_queue'],
      },
      permissions: { queues: ['read'] },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        skillName: 'queue-skill',
        resourceType: 'queues',
        missingIdentifier: 'missing_queue',
      });
    }
  });

  it('reports multiple missing references from a single skill', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('multi-miss', {
      name: 'multi-miss',
      scope: {
        data_products: ['missing_dp_1', 'missing_dp_2'],
        connectors: ['missing_conn'],
      },
      permissions: { data_products: ['read'], connectors: ['read'] },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContainEqual({
        skillName: 'multi-miss',
        resourceType: 'data_products',
        missingIdentifier: 'missing_dp_1',
      });
      expect(result.errors).toContainEqual({
        skillName: 'multi-miss',
        resourceType: 'data_products',
        missingIdentifier: 'missing_dp_2',
      });
      expect(result.errors).toContainEqual({
        skillName: 'multi-miss',
        resourceType: 'connectors',
        missingIdentifier: 'missing_conn',
      });
    }
  });

  it('reports errors from multiple skills', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('skill-a', {
      name: 'skill-a',
      scope: { data_products: ['ghost_a'] },
      permissions: { data_products: ['read'] },
    });
    skills.set('skill-b', {
      name: 'skill-b',
      scope: { queues: ['ghost_queue'] },
      permissions: { queues: ['read'] },
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContainEqual({
        skillName: 'skill-a',
        resourceType: 'data_products',
        missingIdentifier: 'ghost_a',
      });
      expect(result.errors).toContainEqual({
        skillName: 'skill-b',
        resourceType: 'queues',
        missingIdentifier: 'ghost_queue',
      });
    }
  });

  it('skips empty scope arrays without errors', () => {
    const skills = new Map<string, SkillDefinition>();
    skills.set('empty-scope', {
      name: 'empty-scope',
      scope: {
        data_products: [],
        connectors: [],
      },
      permissions: {},
    });

    const result = validateSkillReferences(skills, baseContext);
    expect(result).toEqual({ valid: true });
  });

  it('validates against an empty workspace context', () => {
    const emptyContext: WorkspaceContext = {
      dataProducts: [],
      connectors: [],
      domains: [],
      queues: [],
      flows: [],
      workflows: [],
    };

    const skills = new Map<string, SkillDefinition>();
    skills.set('any-skill', {
      name: 'any-skill',
      scope: { data_products: ['some_dp'] },
      permissions: { data_products: ['read'] },
    });

    const result = validateSkillReferences(skills, emptyContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        skillName: 'any-skill',
        resourceType: 'data_products',
        missingIdentifier: 'some_dp',
      });
    }
  });
});

describe('formatSkillValidationErrors', () => {
  it('formats a single error', () => {
    const formatted = formatSkillValidationErrors([
      {
        skillName: 'my-skill',
        resourceType: 'data_products',
        missingIdentifier: 'ghost_dp',
      },
    ]);
    expect(formatted).toBe(
      'Skill "my-skill": references data_products "ghost_dp" which does not exist in the workspace context'
    );
  });

  it('formats multiple errors separated by newlines', () => {
    const formatted = formatSkillValidationErrors([
      {
        skillName: 'skill-a',
        resourceType: 'data_products',
        missingIdentifier: 'ghost_dp',
      },
      {
        skillName: 'skill-b',
        resourceType: 'queues',
        missingIdentifier: 'ghost_queue',
      },
    ]);
    expect(formatted).toContain('Skill "skill-a"');
    expect(formatted).toContain('Skill "skill-b"');
    expect(formatted.split('\n')).toHaveLength(2);
  });

  it('returns empty string for empty array', () => {
    const formatted = formatSkillValidationErrors([]);
    expect(formatted).toBe('');
  });
});
