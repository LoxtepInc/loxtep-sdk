import { defineDataWorkflow } from './define-data-workflow';
import { on } from './triggers';
import { ValidationError } from '../errors/index';
import type { DataWorkflowModule, TriggerSpec } from './types';

/** Helper to create a valid spec for testing. */
function validSpec(overrides: Partial<DataWorkflowModule> = {}): DataWorkflowModule {
  return {
    name: 'test-workflow',
    triggers: [on.schedule('0 * * * *')],
    handler: async () => {},
    ...overrides,
  };
}

describe('defineDataWorkflow', () => {
  describe('valid specs', () => {
    it('returns the spec unchanged for a minimal valid module', () => {
      const spec = validSpec();
      const result = defineDataWorkflow(spec);
      expect(result).toBe(spec);
    });

    it('accepts a name of exactly 1 character', () => {
      const spec = validSpec({ name: 'x' });
      expect(defineDataWorkflow(spec)).toBe(spec);
    });

    it('accepts a name of exactly 64 characters', () => {
      const spec = validSpec({ name: 'a'.repeat(64) });
      expect(defineDataWorkflow(spec)).toBe(spec);
    });

    it('accepts 1 trigger', () => {
      const spec = validSpec({ triggers: [on.webhook('/hook')] });
      expect(defineDataWorkflow(spec)).toBe(spec);
    });

    it('accepts 10 triggers', () => {
      const triggers: TriggerSpec[] = Array.from({ length: 10 }, (_, i) =>
        on.webhook(`/hook-${i}`),
      );
      const spec = validSpec({ triggers });
      expect(defineDataWorkflow(spec)).toBe(spec);
    });

    it('accepts requireApproval with up to 100 entries', () => {
      const requireApproval = Array.from({ length: 100 }, (_, i) => `op-${i}`);
      const spec = validSpec({ requireApproval });
      expect(defineDataWorkflow(spec)).toBe(spec);
    });

    it('accepts requireApproval entries of 1 to 256 characters', () => {
      const spec = validSpec({ requireApproval: ['x', 'y'.repeat(256)] });
      expect(defineDataWorkflow(spec)).toBe(spec);
    });

    it('accepts a spec without requireApproval', () => {
      const spec = validSpec();
      delete spec.requireApproval;
      expect(defineDataWorkflow(spec)).toBe(spec);
    });
  });

  describe('invalid name', () => {
    it('throws ValidationError for an empty name', () => {
      const spec = validSpec({ name: '' });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const ve = e as ValidationError;
        expect(ve.field_errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
        );
      }
    });

    it('throws ValidationError for a name exceeding 64 characters', () => {
      const spec = validSpec({ name: 'a'.repeat(65) });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        const ve = e as ValidationError;
        expect(ve.field_errors[0].field).toBe('name');
        expect(ve.field_errors[0].message).toContain('65');
      }
    });
  });

  describe('invalid triggers', () => {
    it('throws ValidationError for zero triggers', () => {
      const spec = validSpec({ triggers: [] });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        const ve = e as ValidationError;
        expect(ve.field_errors[0].field).toBe('triggers');
        expect(ve.field_errors[0].message).toContain('0');
      }
    });

    it('throws ValidationError for more than 10 triggers', () => {
      const triggers: TriggerSpec[] = Array.from({ length: 11 }, (_, i) =>
        on.webhook(`/hook-${i}`),
      );
      const spec = validSpec({ triggers });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        const ve = e as ValidationError;
        expect(ve.field_errors[0].field).toBe('triggers');
        expect(ve.field_errors[0].message).toContain('11');
      }
    });
  });

  describe('invalid requireApproval', () => {
    it('throws ValidationError for more than 100 approval names', () => {
      const requireApproval = Array.from({ length: 101 }, (_, i) => `op-${i}`);
      const spec = validSpec({ requireApproval });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        const ve = e as ValidationError;
        expect(ve.field_errors[0].field).toBe('requireApproval');
        expect(ve.field_errors[0].message).toContain('100');
      }
    });

    it('throws ValidationError for an empty string in requireApproval', () => {
      const spec = validSpec({ requireApproval: ['valid', ''] });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        const ve = e as ValidationError;
        expect(ve.field_errors[0].field).toBe('requireApproval');
      }
    });

    it('throws ValidationError for a string exceeding 256 characters in requireApproval', () => {
      const spec = validSpec({ requireApproval: ['x'.repeat(257)] });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        const ve = e as ValidationError;
        expect(ve.field_errors[0].field).toBe('requireApproval');
        expect(ve.field_errors[0].message).toContain('256');
      }
    });
  });

  describe('multiple errors', () => {
    it('reports all validation failures together', () => {
      const spec = validSpec({ name: '', triggers: [] });
      expect(() => defineDataWorkflow(spec)).toThrow(ValidationError);
      try {
        defineDataWorkflow(spec);
      } catch (e) {
        const ve = e as ValidationError;
        expect(ve.field_errors.length).toBe(2);
        expect(ve.field_errors.map((f) => f.field)).toEqual(
          expect.arrayContaining(['name', 'triggers']),
        );
      }
    });
  });
});

describe('on (trigger builders)', () => {
  it('queueEvent returns a TriggerSpec with kind "queue" and the ref', () => {
    const queue = { id: 'q_123', name: 'orders_raw' };
    const trigger = on.queueEvent(queue);
    expect(trigger).toEqual({
      kind: 'queue',
      ref: { id: 'q_123', name: 'orders_raw' },
    });
  });

  it('connectorEvent returns a TriggerSpec with kind "connector" and the ref', () => {
    const connector = { id: 'cn_456', type: 'shopify' };
    const trigger = on.connectorEvent(connector);
    expect(trigger).toEqual({
      kind: 'connector',
      ref: { id: 'cn_456', name: 'shopify' },
    });
  });

  it('schedule returns a TriggerSpec with kind "schedule" and the cron', () => {
    const trigger = on.schedule('0 */6 * * *');
    expect(trigger).toEqual({
      kind: 'schedule',
      schedule: '0 */6 * * *',
    });
  });

  it('webhook returns a TriggerSpec with kind "webhook" and the path', () => {
    const trigger = on.webhook('/ingest/orders');
    expect(trigger).toEqual({
      kind: 'webhook',
      path: '/ingest/orders',
    });
  });
});
