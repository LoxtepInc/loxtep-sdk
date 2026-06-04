/**
 * Trigger builders for code-first data workflow authoring.
 *
 * Each builder accepts typed constants from the Generated_SDK_Artifact and
 * returns a `TriggerSpec` describing the event source.
 */

import type { TriggerSpec, QueueRef, ConnectorRef } from './types.js';

/**
 * Trigger builder namespace. Each method constructs a `TriggerSpec` from a
 * typed workspace constant.
 *
 * Usage:
 * ```ts
 * import { on } from '@loxtep/sdk/authoring';
 * import { queues, connectors } from './.loxtep/generated/index';
 *
 * on.queueEvent(queues.orders_raw)
 * on.connectorEvent(connectors.shopify_main)
 * on.schedule('0 * * * *')
 * on.webhook('/ingest/orders')
 * ```
 */
export const on = {
  /**
   * Trigger on a queue event from a typed queue constant.
   */
  queueEvent(queue: QueueRef): TriggerSpec {
    return {
      kind: 'queue',
      ref: { id: queue.id, name: queue.name },
    };
  },

  /**
   * Trigger on a connector event from a typed connector constant.
   */
  connectorEvent(connector: ConnectorRef): TriggerSpec {
    return {
      kind: 'connector',
      ref: { id: connector.id, name: connector.type },
    };
  },

  /**
   * Trigger on a cron schedule.
   */
  schedule(cron: string): TriggerSpec {
    return {
      kind: 'schedule',
      schedule: cron,
    };
  },

  /**
   * Trigger on an incoming webhook at the given path.
   */
  webhook(path: string): TriggerSpec {
    return {
      kind: 'webhook',
      path,
    };
  },
} as const;
