import { checkScope, checkScopeByName } from './check-scope';
import type { SkillDefinition, SkillScope, Operation } from './types';

describe('checkScope', () => {
  const validSkill: SkillDefinition = {
    name: 'test-skill',
    scope: {
      data_products: ['dp_orders', 'dp_customers'],
      connectors: ['cn_shopify'],
      workflows: ['wf_sync'],
      domains: ['dm_commerce'],
      queues: ['q_raw'],
    },
    permissions: {
      data_products: ['read', 'write'],
      connectors: ['read'],
      workflows: ['read', 'write', 'create', 'delete'],
      domains: ['read'],
      queues: ['read', 'write'],
    },
  };

  describe('UNKNOWN_SKILL', () => {
    it('returns UNKNOWN_SKILL when skill is undefined', () => {
      const result = checkScope(undefined, 'data_products', 'dp_orders', 'read');
      expect(result).toEqual({
        allowed: false,
        code: 'UNKNOWN_SKILL',
        skillName: '',
      });
    });
  });

  describe('SCOPE_VIOLATION', () => {
    it('returns SCOPE_VIOLATION when resource id is not in scope', () => {
      const result = checkScope(validSkill, 'data_products', 'dp_unknown', 'read');
      expect(result).toEqual({
        allowed: false,
        code: 'SCOPE_VIOLATION',
        deniedResource: 'data_products/dp_unknown',
      });
    });

    it('returns SCOPE_VIOLATION when resource type has no scope entries', () => {
      const skillWithoutQueues: SkillDefinition = {
        name: 'limited',
        scope: { data_products: ['dp_orders'] },
        permissions: { data_products: ['read'] },
      };
      const result = checkScope(skillWithoutQueues, 'queues', 'q_raw', 'read');
      expect(result).toEqual({
        allowed: false,
        code: 'SCOPE_VIOLATION',
        deniedResource: 'queues/q_raw',
      });
    });

    it('returns SCOPE_VIOLATION when scope list is empty', () => {
      const skillWithEmptyScope: SkillDefinition = {
        name: 'empty-scope',
        scope: { data_products: [] },
        permissions: { data_products: ['read'] },
      };
      const result = checkScope(skillWithEmptyScope, 'data_products', 'dp_orders', 'read');
      expect(result).toEqual({
        allowed: false,
        code: 'SCOPE_VIOLATION',
        deniedResource: 'data_products/dp_orders',
      });
    });
  });

  describe('OPERATION_DENIED', () => {
    it('returns OPERATION_DENIED when operation is not in permissions', () => {
      const result = checkScope(validSkill, 'connectors', 'cn_shopify', 'write');
      expect(result).toEqual({
        allowed: false,
        code: 'OPERATION_DENIED',
        deniedOperation: 'write',
        resource: 'connectors/cn_shopify',
      });
    });

    it('returns OPERATION_DENIED when resource type has no permissions entry', () => {
      const skillWithoutQueuePerms: SkillDefinition = {
        name: 'no-perms',
        scope: { queues: ['q_raw'] },
        permissions: {},
      };
      const result = checkScope(skillWithoutQueuePerms, 'queues', 'q_raw', 'read');
      expect(result).toEqual({
        allowed: false,
        code: 'OPERATION_DENIED',
        deniedOperation: 'read',
        resource: 'queues/q_raw',
      });
    });

    it('returns OPERATION_DENIED for delete when only read/write permitted', () => {
      const result = checkScope(validSkill, 'data_products', 'dp_orders', 'delete');
      expect(result).toEqual({
        allowed: false,
        code: 'OPERATION_DENIED',
        deniedOperation: 'delete',
        resource: 'data_products/dp_orders',
      });
    });
  });

  describe('allowed', () => {
    it('returns allowed when resource is in scope and operation is permitted', () => {
      const result = checkScope(validSkill, 'data_products', 'dp_orders', 'read');
      expect(result).toEqual({ allowed: true });
    });

    it('returns allowed for write on in-scope data product', () => {
      const result = checkScope(validSkill, 'data_products', 'dp_customers', 'write');
      expect(result).toEqual({ allowed: true });
    });

    it('returns allowed for all CRUD on workflows', () => {
      for (const op of ['read', 'write', 'create', 'delete'] as Operation[]) {
        const result = checkScope(validSkill, 'workflows', 'wf_sync', op);
        expect(result).toEqual({ allowed: true });
      }
    });
  });

  describe('SCOPE_VALIDATION_FAILED (fail-closed)', () => {
    it('returns SCOPE_VALIDATION_FAILED when scope check throws', () => {
      // Construct an object that will throw when accessed
      const badSkill = {
        name: 'bad',
        scope: new Proxy({}, {
          get() { throw new Error('boom'); }
        }),
        permissions: {},
      } as unknown as SkillDefinition;

      const result = checkScope(badSkill, 'data_products', 'dp_orders', 'read');
      expect(result).toEqual({ allowed: false, code: 'SCOPE_VALIDATION_FAILED' });
    });
  });
});

describe('checkScopeByName', () => {
  const skills = new Map<string, SkillDefinition>();
  skills.set('analytics', {
    name: 'analytics',
    scope: { data_products: ['dp_orders'] },
    permissions: { data_products: ['read'] },
  });

  it('returns UNKNOWN_SKILL when skill name not in map', () => {
    const result = checkScopeByName(skills, 'nonexistent', 'data_products', 'dp_orders', 'read');
    expect(result).toEqual({
      allowed: false,
      code: 'UNKNOWN_SKILL',
      skillName: 'nonexistent',
    });
  });

  it('delegates to checkScope when skill is found', () => {
    const result = checkScopeByName(skills, 'analytics', 'data_products', 'dp_orders', 'read');
    expect(result).toEqual({ allowed: true });
  });

  it('returns SCOPE_VIOLATION for out-of-scope resource', () => {
    const result = checkScopeByName(skills, 'analytics', 'data_products', 'dp_other', 'read');
    expect(result).toEqual({
      allowed: false,
      code: 'SCOPE_VIOLATION',
      deniedResource: 'data_products/dp_other',
    });
  });

  it('returns OPERATION_DENIED for disallowed operation', () => {
    const result = checkScopeByName(skills, 'analytics', 'data_products', 'dp_orders', 'write');
    expect(result).toEqual({
      allowed: false,
      code: 'OPERATION_DENIED',
      deniedOperation: 'write',
      resource: 'data_products/dp_orders',
    });
  });
});
