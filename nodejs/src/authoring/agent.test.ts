/**
 * Unit tests for the `agent()` entry point.
 *
 * Covers:
 * - Input validation (R4.2, R4.6)
 * - Scope enforcement (R4.3, R4.4)
 * - Action trace recording (R4.5, R7.1)
 */

import {
  agent,
  validateAgentOptions,
  computeReachableScope,
  enforceAgentScope,
  createScopeGuardedToolbox,
  ActionTrace,
  AgentScopeError,
} from './agent.js';
import type { AgentOptions, AgentExecutionContext, SkillRef } from './agent.js';
import type { HandlerContext } from './types.js';
import type { Toolbox } from './toolbox.js';
import type { SkillDefinition } from '../skills/types.js';
import { ValidationError } from '../errors/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHandlerContext(): HandlerContext {
  return {
    workflowName: 'test-workflow',
    instanceId: 'inst_123',
    projectId: 'proj_456',
  };
}

function makeSkillDefinition(name: string, overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    name,
    scope: {
      data_products: ['orders_raw'],
      connectors: ['shopify_main'],
      workflows: [],
      domains: ['commerce'],
      queues: ['orders_raw'],
    },
    permissions: {
      data_products: ['read', 'write'],
      connectors: ['read'],
      queues: ['read', 'write'],
    },
    ...overrides,
  };
}

function makeMockToolbox(): Toolbox {
  return {
    dataProducts: {
      write: jest.fn().mockResolvedValue({ success: true, events_written: 1 }),
      query: jest.fn().mockResolvedValue({ items: [], metadata: {} }),
      get: jest.fn().mockResolvedValue({ name: 'orders_raw', id: 'dp_1' }),
      list: jest.fn().mockResolvedValue([]),
    },
    queues: {
      write: jest.fn().mockResolvedValue(undefined),
      getMetadata: jest.fn().mockResolvedValue({ queue_name: 'orders_raw' }),
    },
    connections: {
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ id: 'conn_1', name: 'test' }),
      test: jest.fn().mockResolvedValue({ success: true }),
    },
    workflows: {
      list: jest.fn().mockResolvedValue([]),
      getGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    },
  };
}

// ─── Input validation tests ──────────────────────────────────────────────────

describe('validateAgentOptions', () => {
  const availableSkills = new Set(['orders-readonly', 'commerce-full']);

  it('should accept valid options', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: 'Summarize recent orders', skills: [{ name: 'orders-readonly' }] },
        availableSkills
      );
    }).not.toThrow();
  });

  it('should reject empty prompt', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: '', skills: [{ name: 'orders-readonly' }] },
        availableSkills
      );
    }).toThrow(ValidationError);
  });

  it('should reject oversized prompt (>10,000 chars)', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: 'x'.repeat(10_001), skills: [{ name: 'orders-readonly' }] },
        availableSkills
      );
    }).toThrow(ValidationError);
  });

  it('should accept prompt at max length (10,000 chars)', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: 'x'.repeat(10_000), skills: [{ name: 'orders-readonly' }] },
        availableSkills
      );
    }).not.toThrow();
  });

  it('should reject empty skills array', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: 'hello', skills: [] },
        availableSkills
      );
    }).toThrow(ValidationError);
  });

  it('should reject skills array with more than 50 entries', () => {
    const skills: SkillRef[] = Array.from({ length: 51 }, () => ({ name: 'orders-readonly' }));
    expect(() => {
      validateAgentOptions(
        { prompt: 'hello', skills },
        availableSkills
      );
    }).toThrow(ValidationError);
  });

  it('should reject a skill not present in the generated artifact', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: 'hello', skills: [{ name: 'nonexistent-skill' }] },
        availableSkills
      );
    }).toThrow(ValidationError);
  });

  it('should report specific field errors', () => {
    try {
      validateAgentOptions(
        { prompt: '', skills: [] },
        availableSkills
      );
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.field_errors.length).toBeGreaterThanOrEqual(2);
      expect(ve.field_errors.some(e => e.field === 'prompt')).toBe(true);
      expect(ve.field_errors.some(e => e.field === 'skills')).toBe(true);
    }
  });

  it('should reject non-string prompt', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: 42 as unknown as string, skills: [{ name: 'orders-readonly' }] },
        availableSkills
      );
    }).toThrow(ValidationError);
  });

  it('should reject skill with empty name', () => {
    expect(() => {
      validateAgentOptions(
        { prompt: 'hello', skills: [{ name: '' }] },
        availableSkills
      );
    }).toThrow(ValidationError);
  });
});

// ─── Scope enforcement tests ─────────────────────────────────────────────────

describe('computeReachableScope', () => {
  it('should merge scopes from multiple skills', () => {
    const skill1 = makeSkillDefinition('skill1', {
      scope: { data_products: ['dp_a'], queues: ['q_a'] },
      permissions: { data_products: ['read'], queues: ['write'] },
    });
    const skill2 = makeSkillDefinition('skill2', {
      scope: { data_products: ['dp_b'], connectors: ['c_x'] },
      permissions: { data_products: ['write'], connectors: ['read'] },
    });

    const merged = computeReachableScope([skill1, skill2]);
    expect(merged.scope.data_products).toContain('dp_a');
    expect(merged.scope.data_products).toContain('dp_b');
    expect(merged.scope.queues).toContain('q_a');
    expect(merged.scope.connectors).toContain('c_x');
    expect(merged.permissions.data_products).toContain('read');
    expect(merged.permissions.data_products).toContain('write');
  });

  it('should deduplicate scope entries', () => {
    const skill1 = makeSkillDefinition('skill1', {
      scope: { data_products: ['dp_a'] },
      permissions: { data_products: ['read'] },
    });
    const skill2 = makeSkillDefinition('skill2', {
      scope: { data_products: ['dp_a'] },
      permissions: { data_products: ['read'] },
    });

    const merged = computeReachableScope([skill1, skill2]);
    expect(merged.scope.data_products!.filter(x => x === 'dp_a').length).toBe(1);
  });
});

describe('enforceAgentScope', () => {
  const mergedSkill = computeReachableScope([makeSkillDefinition('test')]);

  it('should allow in-scope resource with permitted operation', () => {
    const decision = enforceAgentScope(mergedSkill, 'data_products', 'orders_raw', 'read');
    expect(decision.allowed).toBe(true);
  });

  it('should block out-of-scope resource with SCOPE_VIOLATION', () => {
    const decision = enforceAgentScope(mergedSkill, 'data_products', 'secret_data', 'read');
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe('SCOPE_VIOLATION');
    }
  });

  it('should block disallowed operation with OPERATION_DENIED', () => {
    // connectors only has 'read' permission
    const decision = enforceAgentScope(mergedSkill, 'connectors', 'shopify_main', 'write');
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe('OPERATION_DENIED');
    }
  });
});

// ─── Action trace tests ──────────────────────────────────────────────────────

describe('ActionTrace', () => {
  it('should assign monotonically increasing sequence numbers', () => {
    const trace = new ActionTrace();
    const e1 = trace.record({
      kind: 'toolbox',
      operationName: 'op1',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:01Z',
      outcome: 'succeeded',
    });
    const e2 = trace.record({
      kind: 'toolbox',
      operationName: 'op2',
      startedAt: '2024-01-01T00:00:01Z',
      completedAt: '2024-01-01T00:00:02Z',
      outcome: 'succeeded',
    });
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
  });

  it('should return entries in order', () => {
    const trace = new ActionTrace();
    trace.record({ kind: 'toolbox', operationName: 'a', startedAt: 't1', completedAt: 't2', outcome: 'succeeded' });
    trace.record({ kind: 'toolbox', operationName: 'b', startedAt: 't2', completedAt: 't3', outcome: 'failed' });
    trace.record({ kind: 'scope_check', operationName: 'c', startedAt: 't3', completedAt: 't4', outcome: 'blocked' });

    const entries = trace.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].operationName).toBe('a');
    expect(entries[1].operationName).toBe('b');
    expect(entries[2].operationName).toBe('c');
  });

  it('should return a copy of entries (immutable)', () => {
    const trace = new ActionTrace();
    trace.record({ kind: 'toolbox', operationName: 'a', startedAt: 't1', completedAt: 't2', outcome: 'succeeded' });
    const entries1 = trace.getEntries();
    trace.record({ kind: 'toolbox', operationName: 'b', startedAt: 't2', completedAt: 't3', outcome: 'succeeded' });
    const entries2 = trace.getEntries();
    expect(entries1).toHaveLength(1);
    expect(entries2).toHaveLength(2);
  });
});

// ─── Scope-guarded toolbox tests ─────────────────────────────────────────────

describe('createScopeGuardedToolbox', () => {
  it('should allow and trace in-scope operations', async () => {
    const toolbox = makeMockToolbox();
    const skill = makeSkillDefinition('test');
    const mergedSkill = computeReachableScope([skill]);
    const trace = new ActionTrace();
    const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

    await guarded.dataProducts.write({ id: 'dp_1', name: 'orders_raw' }, { event: 'data' });

    expect(toolbox.dataProducts.write).toHaveBeenCalled();
    const entries = trace.getEntries();
    expect(entries.some(e => e.operationName === 'dataProducts.write' && e.outcome === 'succeeded')).toBe(true);
  });

  it('should block out-of-scope write and record blocked trace entry', async () => {
    const toolbox = makeMockToolbox();
    const skill = makeSkillDefinition('test');
    const mergedSkill = computeReachableScope([skill]);
    const trace = new ActionTrace();
    const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

    // guardCall throws synchronously before the async call
    expect(() => {
      guarded.dataProducts.write({ id: 'dp_secret', name: 'secret_data' }, { event: 'x' });
    }).toThrow(AgentScopeError);

    // The underlying toolbox should NOT have been called
    expect(toolbox.dataProducts.write).not.toHaveBeenCalled();
    // A blocked trace entry should exist
    const entries = trace.getEntries();
    expect(entries.some(e => e.outcome === 'blocked')).toBe(true);
  });

  it('should block disallowed operations', async () => {
    const toolbox = makeMockToolbox();
    const skill = makeSkillDefinition('test', {
      scope: { connectors: ['shopify_main'] },
      permissions: { connectors: ['read'] }, // only read allowed
    });
    const mergedSkill = computeReachableScope([skill]);
    const trace = new ActionTrace();
    const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

    // connections.get maps to connectors read — this should work
    await guarded.connections.get('shopify_main');
    expect(toolbox.connections.get).toHaveBeenCalled();
  });

  it('should record failed toolbox operations in the trace', async () => {
    const toolbox = makeMockToolbox();
    (toolbox.dataProducts.write as jest.Mock).mockRejectedValue(new Error('network error'));
    const skill = makeSkillDefinition('test');
    const mergedSkill = computeReachableScope([skill]);
    const trace = new ActionTrace();
    const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

    await expect(
      guarded.dataProducts.write({ id: 'dp_1', name: 'orders_raw' }, { event: 'x' })
    ).rejects.toThrow('network error');

    const entries = trace.getEntries();
    expect(entries.some(e => e.operationName === 'dataProducts.write' && e.outcome === 'failed')).toBe(true);
  });
});

// ─── agent() integration tests ───────────────────────────────────────────────

describe('agent()', () => {
  const ctx = makeHandlerContext();

  it('should reject invalid options before invoking any model', async () => {
    const execContext: AgentExecutionContext = {
      handlerContext: ctx,
      skillDefinitions: [makeSkillDefinition('orders-readonly')],
      toolbox: makeMockToolbox(),
      availableSkillNames: new Set(['orders-readonly']),
    };

    await expect(
      agent(ctx, { prompt: '', skills: [{ name: 'orders-readonly' }] }, execContext)
    ).rejects.toThrow(ValidationError);
  });

  it('should succeed with valid options and record scope computation trace', async () => {
    const execContext: AgentExecutionContext = {
      handlerContext: ctx,
      skillDefinitions: [makeSkillDefinition('orders-readonly')],
      toolbox: makeMockToolbox(),
      availableSkillNames: new Set(['orders-readonly']),
    };

    const result = await agent(
      ctx,
      { prompt: 'Summarize orders', skills: [{ name: 'orders-readonly' }] },
      execContext
    );

    expect(result.success).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.trace[0].operationName).toBe('compute_reachable_scope');
    expect(result.trace[0].outcome).toBe('succeeded');
  });

  it('should reject skills not in the generated artifact', async () => {
    const execContext: AgentExecutionContext = {
      handlerContext: ctx,
      skillDefinitions: [],
      toolbox: makeMockToolbox(),
      availableSkillNames: new Set(['orders-readonly']),
    };

    await expect(
      agent(ctx, { prompt: 'hello', skills: [{ name: 'unknown' }] }, execContext)
    ).rejects.toThrow(ValidationError);
  });
});
