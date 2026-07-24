/**
 * Deterministic `toolbox` namespace — direct, typed platform calls with no model
 * in the loop (R4.1, R4.7).
 *
 * Each method is a thin wrapper over the corresponding `LoxtepClient` namespace
 * method. On success, it returns a typed result. On failure, it throws a
 * `ToolboxOperationError` identifying the failed operation — it never falls back
 * to a model.
 */

import type { LoxtepClient } from '../client/loxtep-client.js';
import type { DataProduct, DataProductQueryResult } from '../client/data-products-types.js';
import type { Trigger, TriggerTestResult } from '../client/trigger-types.js';
import type { Flow } from '../client/flow-types.js';
import type { WorkflowGraph } from '../client/workflows-types.js';
import type { QueueRef, ConnectorRef } from './types.js';
import { LoxtepError } from '../errors/base.js';

// ─── Result types ────────────────────────────────────────────────────────────

/** Result of a data product write operation. */
export interface WriteResult {
  /** Whether the write succeeded. */
  success: true;
  /** Number of events written. */
  events_written: number;
}

/** Rows returned from a data product query. */
export interface QueryRows {
  items: Record<string, unknown>[];
  metadata: DataProductQueryResult['metadata'];
}

// ─── Error type ──────────────────────────────────────────────────────────────

/**
 * Error thrown when a deterministic toolbox operation fails.
 * Identifies the failed operation and namespace so the caller can
 * distinguish it from other errors.
 *
 * Per R4.7 — the SDK never falls back to a model on failure.
 */
export class ToolboxOperationError extends LoxtepError {
  /** The toolbox namespace where the failure occurred (e.g. 'dataProducts'). */
  readonly namespace: string;
  /** The operation that failed (e.g. 'write', 'query', 'list'). */
  readonly operation: string;

  constructor(
    namespace: string,
    operation: string,
    message: string,
    cause?: unknown
  ) {
    super(
      `toolbox.${namespace}.${operation} failed: ${message}`,
      {
        code: 'TOOLBOX_OPERATION_FAILED',
        status_code: (cause as { status_code?: number } | undefined)?.status_code,
        details: {
          namespace,
          operation,
          ...(cause instanceof Error ? { cause_message: cause.message } : {}),
        },
      }
    );
    this.name = 'ToolboxOperationError';
    this.namespace = namespace;
    this.operation = operation;
    Object.setPrototypeOf(this, ToolboxOperationError.prototype);
  }
}

// ─── Toolbox interface ───────────────────────────────────────────────────────

/** Typed reference to a data product from the Generated_SDK_Artifact. */
export interface DataProductRef {
  id: string;
  name: string;
}

/** Typed reference to a workflow from the Generated_SDK_Artifact. */
export interface WorkflowRef {
  id: string;
  name: string;
}

// Re-export QueueRef and ConnectorRef from types for toolbox consumers
export type { QueueRef, ConnectorRef } from './types.js';

/**
 * Data products toolbox — deterministic operations on data products.
 */
export interface ToolboxDataProducts {
  /** Write an event to a data product's stream queue. */
  write(ref: DataProductRef, event: unknown): Promise<WriteResult>;
  /** Execute a SQL query against a data product. */
  query(ref: DataProductRef, sql: string): Promise<QueryRows>;
  /** Get a data product by reference. */
  get(ref: DataProductRef): Promise<DataProduct>;
  /** List data products (optionally filtered by domain). */
  list(filters?: { domain_id?: string }): Promise<DataProduct[]>;
}

/**
 * Queues toolbox — deterministic operations on queues.
 */
export interface ToolboxQueues {
  /** Write an event to a queue. */
  write(ref: QueueRef, event: unknown): Promise<void>;
  /** Get queue metadata. */
  getMetadata(ref: QueueRef): Promise<{ queue_name: string; [key: string]: unknown }>;
}

/**
 * Connections toolbox — deterministic operations on connections.
 */
export interface ToolboxConnections {
  /** List connections (triggers) for the project. */
  list(): Promise<Trigger[]>;
  /** Get a specific connection (trigger). */
  get(connectionId: string): Promise<Trigger>;
  /** Test a connection (trigger). */
  test(connectionId: string): Promise<TriggerTestResult>;
}

/**
 * Workflows toolbox — deterministic operations on workflows.
 */
export interface ToolboxWorkflows {
  /** List workflows for the project. */
  list(): Promise<Flow[]>;
  /** Get a workflow's graph. */
  getGraph(ref: WorkflowRef): Promise<WorkflowGraph>;
}

/**
 * The deterministic Toolbox namespace — thin typed wrappers over
 * `LoxtepClient` namespaces. Each method returns typed results or throws a
 * `ToolboxOperationError`. No model is ever invoked.
 */
export interface Toolbox {
  dataProducts: ToolboxDataProducts;
  queues: ToolboxQueues;
  connections: ToolboxConnections;
  workflows: ToolboxWorkflows;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Options for creating a toolbox.
 */
export interface CreateToolboxOptions {
  /** The LoxtepClient instance to use for platform calls. */
  client: LoxtepClient;
  /** The project ID (used for project-scoped operations). */
  projectId: string;
}

/**
 * Create a `Toolbox` — deterministic, typed platform operations with no model
 * in the loop.
 *
 * On success each method returns a typed result. On failure, a
 * `ToolboxOperationError` is thrown identifying the failed operation.
 * The toolbox never falls back to an AI model.
 *
 * @param options - Client and project configuration.
 * @returns A `Toolbox` instance.
 */
export function createToolbox(options: CreateToolboxOptions): Toolbox {
  const { client, projectId } = options;

  const dataProducts: ToolboxDataProducts = {
    async write(ref: DataProductRef, event: unknown): Promise<WriteResult> {
      try {
        const writer = await client.get_writer(ref.name);
        writer.write(event);
        await writer.close();
        return { success: true, events_written: 1 };
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'dataProducts',
          'write',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },

    async query(ref: DataProductRef, sql: string): Promise<QueryRows> {
      try {
        const result = await client.query.query(ref.id, sql);
        return { items: result.items, metadata: result.metadata };
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'dataProducts',
          'query',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },

    async get(ref: DataProductRef): Promise<DataProduct> {
      try {
        return await client.build.data_products.get(ref.id);
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'dataProducts',
          'get',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },

    async list(filters?: { domain_id?: string }): Promise<DataProduct[]> {
      try {
        const result = await client.build.data_products.list({
          domain_id: filters?.domain_id,
        });
        return result.items;
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'dataProducts',
          'list',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },
  };

  const queues: ToolboxQueues = {
    async write(ref: QueueRef, event: unknown): Promise<void> {
      try {
        const writer = await client.observe.open_writer({
          bot_id: `toolbox-writer-${ref.name}`,
          queue_name: ref.name,
        });
        await writer.write(event);
        await writer.close();
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'queues',
          'write',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },

    async getMetadata(ref: QueueRef): Promise<{ queue_name: string; [key: string]: unknown }> {
      try {
        const metadata = await client.observe.get_queue_metadata(ref.name);
        return metadata as { queue_name: string; [key: string]: unknown };
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'queues',
          'getMetadata',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },
  };

  const connections: ToolboxConnections = {
    async list(): Promise<Trigger[]> {
      try {
        const projectId = client.project_id;
        if (!projectId) {
          throw new Error('project_id required on LoxtepClient for connections.list');
        }
        const result = await client.build.triggers.list({ project_id: projectId });
        return result.items;
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'connections',
          'list',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },

    async get(connectionId: string): Promise<Trigger> {
      try {
        const projectId = client.project_id;
        if (!projectId) {
          throw new Error('project_id required on LoxtepClient for connections.get');
        }
        return await client.build.triggers.get(connectionId, { project_id: projectId });
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'connections',
          'get',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },

    async test(connectionId: string): Promise<TriggerTestResult> {
      try {
        const projectId = client.project_id;
        if (!projectId) {
          throw new Error('project_id required on LoxtepClient for connections.test');
        }
        return await client.build.triggers.test(connectionId, { project_id: projectId });
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'connections',
          'test',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },
  };

  const workflows: ToolboxWorkflows = {
    async list(): Promise<Flow[]> {
      try {
        const result = await client.build.workflows.list({ project_id: projectId });
        return result.items;
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'workflows',
          'list',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },

    async getGraph(ref: WorkflowRef): Promise<WorkflowGraph> {
      try {
        return await client.build.workflows.get_graph(ref.id, projectId);
      } catch (err: unknown) {
        throw new ToolboxOperationError(
          'workflows',
          'getGraph',
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    },
  };

  return { dataProducts, queues, connections, workflows };
}
