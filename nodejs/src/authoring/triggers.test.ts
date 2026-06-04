/**
 * Type-level + example tests for trigger builder shapes.
 *
 * Validates: Requirements 3.2, 3.3
 *
 * - R3.2: Trigger builders accept typed constants from the Generated_SDK_Artifact.
 * - R3.3: Accessing a field not declared on a typed constant produces a compile-time type error.
 */

import { on } from './triggers';
import type { TriggerSpec, QueueRef, ConnectorRef } from './types';

describe('Trigger builder shapes (R3.2, R3.3)', () => {
  describe('on.queueEvent', () => {
    it('returns a TriggerSpec with kind "queue" and ref containing id + name', () => {
      const queue: QueueRef = { id: 'q_abc', name: 'orders_raw' };
      const result = on.queueEvent(queue);

      expect(result.kind).toBe('queue');
      expect(result.ref).toEqual({ id: 'q_abc', name: 'orders_raw' });
      expect(result.schedule).toBeUndefined();
      expect(result.path).toBeUndefined();
    });

    it('satisfies the TriggerSpec interface', () => {
      const queue: QueueRef = { id: 'q_123', name: 'events' };
      const trigger: TriggerSpec = on.queueEvent(queue);
      expect(trigger.kind).toBe('queue');
    });

    it('rejects a QueueRef missing required fields at compile time', () => {
      // @ts-expect-error — QueueRef requires both `id` and `name`
      on.queueEvent({ id: 'q_123' });
    });

    it('rejects a plain string instead of a QueueRef at compile time', () => {
      // @ts-expect-error — queueEvent requires a QueueRef object, not a string
      on.queueEvent('q_123');
    });
  });

  describe('on.connectorEvent', () => {
    it('returns a TriggerSpec with kind "connector" and ref containing id + type as name', () => {
      const connector: ConnectorRef = { id: 'cn_456', type: 'shopify' };
      const result = on.connectorEvent(connector);

      expect(result.kind).toBe('connector');
      expect(result.ref).toEqual({ id: 'cn_456', name: 'shopify' });
      expect(result.schedule).toBeUndefined();
      expect(result.path).toBeUndefined();
    });

    it('satisfies the TriggerSpec interface', () => {
      const connector: ConnectorRef = { id: 'cn_x', type: 'stripe' };
      const trigger: TriggerSpec = on.connectorEvent(connector);
      expect(trigger.kind).toBe('connector');
    });

    it('rejects a ConnectorRef missing required fields at compile time', () => {
      // @ts-expect-error — ConnectorRef requires both `id` and `type`
      on.connectorEvent({ id: 'cn_789' });
    });

    it('rejects a QueueRef passed to connectorEvent at compile time', () => {
      // @ts-expect-error — connectorEvent expects ConnectorRef (with `type`), not QueueRef (with `name`)
      on.connectorEvent({ id: 'q_1', name: 'queue_name' });
    });
  });

  describe('on.schedule', () => {
    it('returns a TriggerSpec with kind "schedule" and the cron expression', () => {
      const result = on.schedule('*/5 * * * *');

      expect(result.kind).toBe('schedule');
      expect(result.schedule).toBe('*/5 * * * *');
      expect(result.ref).toBeUndefined();
      expect(result.path).toBeUndefined();
    });

    it('satisfies the TriggerSpec interface', () => {
      const trigger: TriggerSpec = on.schedule('0 0 * * *');
      expect(trigger.kind).toBe('schedule');
    });

    it('rejects a non-string argument at compile time', () => {
      // @ts-expect-error — schedule requires a string cron expression, not a number
      on.schedule(123);
    });
  });

  describe('on.webhook', () => {
    it('returns a TriggerSpec with kind "webhook" and the path', () => {
      const result = on.webhook('/ingest/events');

      expect(result.kind).toBe('webhook');
      expect(result.path).toBe('/ingest/events');
      expect(result.ref).toBeUndefined();
      expect(result.schedule).toBeUndefined();
    });

    it('satisfies the TriggerSpec interface', () => {
      const trigger: TriggerSpec = on.webhook('/hook');
      expect(trigger.kind).toBe('webhook');
    });

    it('rejects a non-string argument at compile time', () => {
      // @ts-expect-error — webhook requires a string path, not an object
      on.webhook({ path: '/hook' });
    });
  });

  describe('TriggerSpec type safety — undeclared field access (R3.3)', () => {
    it('accessing an undeclared field on a queue TriggerSpec fails to compile', () => {
      const queue: QueueRef = { id: 'q_1', name: 'test' };
      const trigger = on.queueEvent(queue);

      // The returned TriggerSpec exposes only kind, ref, schedule, path.
      // Accessing a field not in the interface is a compile error.
      // @ts-expect-error — `connectionId` is not a field on TriggerSpec
      void trigger.connectionId;
    });

    it('accessing an undeclared field on a connector TriggerSpec fails to compile', () => {
      const connector: ConnectorRef = { id: 'cn_1', type: 'hubspot' };
      const trigger = on.connectorEvent(connector);

      // @ts-expect-error — `connectorType` is not a field on TriggerSpec
      void trigger.connectorType;
    });

    it('accessing an undeclared field on a schedule TriggerSpec fails to compile', () => {
      const trigger = on.schedule('0 * * * *');

      // @ts-expect-error — `cronExpression` is not a field on TriggerSpec
      void trigger.cronExpression;
    });

    it('accessing an undeclared field on a webhook TriggerSpec fails to compile', () => {
      const trigger = on.webhook('/events');

      // @ts-expect-error — `url` is not a field on TriggerSpec
      void trigger.url;
    });

    it('QueueRef rejects undeclared fields at the type level', () => {
      // @ts-expect-error — QueueRef only has `id` and `name`, not `domain`
      const _badQueue: QueueRef = { id: 'q_1', name: 'test', domain: 'commerce' };
      void _badQueue;
    });

    it('ConnectorRef rejects undeclared fields at the type level', () => {
      // @ts-expect-error — ConnectorRef only has `id` and `type`, not `name`
      const _badConnector: ConnectorRef = { id: 'cn_1', type: 'stripe', name: 'my-stripe' };
      void _badConnector;
    });
  });
});
