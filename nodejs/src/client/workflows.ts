/**
 * Workflows API: list, get (with nodes), create, get_graph, deploy, get_writer.
 * Backend: workflows microservice (/workflows/workflows, graph, projects/:id/deploy).
 *
 * A workflow is a DAG of nodes (ingestion → transformation → export). This
 * namespace is the single surface for the workflow entity and its lifecycle;
 * the former `flows` namespace has been folded in here.
 *
 * `get_writer` is a low-level stream-writer escape hatch — see `@internal` note.
 * Live event writes use the Loxtep stream data plane, not HTTP POST.
 */

import type { RStreamsSdk } from '../rstreams/leo-runtime.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
  WorkflowsListFilters,
  WorkflowsListResponse,
  GetWorkflowGraphResponse,
  DeployInput,
  DeployResponse,
  CreateWorkflowInput,
  SaveWorkflowBundleInput,
  SaveWorkflowBundleResult,
  SaveWorkflowBundleResponse,
} from './workflows-types.js';
import type {
  Flow,
  FlowWithNodes,
  FlowNode,
  FlowWriter,
  GetWriterOptions,
} from './flow-types.js';
import type { DefinitionValidationErrorEntry } from '../errors/types.js';
import { DefinitionValidationError } from '../errors/validation.js';
import { StreamingError } from '../errors/streaming.js';
import { createQueueWriter } from '../rstreams/event-bridge.js';
import type { WriteOptions } from './queue-types.js';
import { resolveIngestionQueueName } from './flow-queue-resolve.js';

const WORKFLOWS_BASE = '/workflows/workflows';
const PROJECTS_BASE = '/workflows/projects';

export interface WorkflowsApiDeps {
  /** Stream runtime; required for get_writer().close() */
  rsdk?: RStreamsSdk;
  /** Lazy stream runtime resolver (attempts observe.stream_config() when rsdk is not set). */
  get_rsdk?: () => Promise<RStreamsSdk | undefined>;
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function validateEventAgainstDefinition(
  event: unknown,
  definition: Record<string, unknown>
): DefinitionValidationErrorEntry[] {
  const errors: DefinitionValidationErrorEntry[] = [];
  const required = definition.required as string[] | undefined;
  if (
    Array.isArray(required) &&
    required.length > 0 &&
    event !== null &&
    typeof event === 'object'
  ) {
    const obj = event as Record<string, unknown>;
    for (const key of required) {
      if (!(key in obj) || obj[key] === undefined) {
        errors.push({ path: key, message: `Missing required field: ${key}` });
      }
    }
  }
  return errors;
}

/**
 * Determine whether an error is transient and should be retried.
 * Transient: network errors, timeouts, throttling (429), 5xx responses.
 * Non-transient: 4xx (except 429), auth failures — fail immediately.
 */
export function isTransientError(err: unknown): boolean {
  if (err === null || err === undefined) return false;

  // Check for status code on the error object (HTTP response errors)
  const statusCode =
    typeof (err as { status_code?: unknown }).status_code === 'number'
      ? (err as { status_code: number }).status_code
      : typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : undefined;

  if (statusCode !== undefined) {
    // 429 (throttling) is transient
    if (statusCode === 429) return true;
    // 5xx responses are transient
    if (statusCode >= 500 && statusCode < 600) return true;
    // Other 4xx are non-transient (auth failures, validation errors, etc.)
    if (statusCode >= 400 && statusCode < 500) return false;
  }

  // Check error code strings
  const code =
    typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;

  if (code) {
    const transientCodes = new Set([
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'EPIPE',
      'EAI_AGAIN',
      'RATE_LIMIT_EXCEEDED',
      'RATE_LIMIT_ERROR',
      'SERVICE_UNAVAILABLE',
      'GATEWAY_TIMEOUT',
      'INTERNAL_SERVER_ERROR',
    ]);
    if (transientCodes.has(code)) return true;

    // Auth-related codes are non-transient
    const nonTransientCodes = new Set([
      'AUTHENTICATION_ERROR',
      'AUTHORIZATION_ERROR',
      'VALIDATION_ERROR',
      'NOT_FOUND',
    ]);
    if (nonTransientCodes.has(code)) return false;
  }

  // Check error message for network-related keywords
  const message =
    typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message.toLowerCase()
      : '';

  if (
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('socket hang up')
  ) {
    return true;
  }

  // Default: treat unknown errors as transient to allow retry
  return true;
}

/**
 * Sleep for the given number of milliseconds. Extracted for testability.
 */
export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type WorkflowsApi = {
  list: (filters: WorkflowsListFilters) => Promise<WorkflowsListResponse['data']>;
  get: (id: string) => Promise<FlowWithNodes>;
  create: (input: CreateWorkflowInput) => Promise<Flow>;
  get_graph: (
    workflow_id: string,
    project_id: string
  ) => Promise<GetWorkflowGraphResponse['data']>;
  deploy: (input: DeployInput) => Promise<DeployResponse['data']>;
  save_workflow_bundle: (
    project_id: string,
    input: SaveWorkflowBundleInput
  ) => Promise<SaveWorkflowBundleResult>;
  /**
   * @internal
   * Low-level stream-writer escape hatch. Requires explicit `bot_id` and an
   * output queue (or `environment_prefix` + `project_id` to resolve it).
   * Undocumented for customers — use `data_products.get_writer(name)` instead.
   */
  get_writer: (workflow_id: string, options?: GetWriterOptions) => Promise<FlowWriter>;
};

export function createWorkflowsApi(
  http: LoxtepHttpClient,
  deps?: WorkflowsApiDeps
): WorkflowsApi {
  const api: WorkflowsApi = {
    async list(filters: WorkflowsListFilters): Promise<WorkflowsListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        project_id: filters.project_id,
        page: filters.page ?? 1,
        page_size: filters.page_size ?? 100,
      };
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const qs = buildQueryString(params);
      const res = await http.get<WorkflowsListResponse>(`${WORKFLOWS_BASE}${qs}`);
      return res.data;
    },

    async get(id: string): Promise<FlowWithNodes> {
      const flowRes = await http.get<{ success: true; data: Flow }>(
        `${WORKFLOWS_BASE}/${encodeURIComponent(id)}`
      );
      const flow = flowRes.data;
      let nodes: FlowNode[] = [];
      try {
        const nodesRes = await http.get<{ success: true; data: { items: FlowNode[] } }>(
          `${WORKFLOWS_BASE}/${encodeURIComponent(id)}/nodes`
        );
        const payload = (nodesRes as { data?: { items?: FlowNode[] } }).data ?? nodesRes;
        nodes = (payload as { items?: FlowNode[] }).items ?? [];
      } catch {
        // Nodes endpoint may not exist or may 404; workflow still has node_count
      }
      return { ...flow, nodes };
    },

    async create(input: CreateWorkflowInput): Promise<Flow> {
      const res = await http.post<{ success: true; data: Flow }>(WORKFLOWS_BASE, input);
      return res.data;
    },

    async get_graph(
      workflow_id: string,
      project_id: string
    ): Promise<GetWorkflowGraphResponse['data']> {
      const qs = buildQueryString({ project_id });
      const res = await http.get<GetWorkflowGraphResponse>(
        `${WORKFLOWS_BASE}/${encodeURIComponent(workflow_id)}/graph${qs}`
      );
      return res.data;
    },

    async deploy(input: DeployInput): Promise<DeployResponse['data']> {
      const { project_id, instance_id, version_id, force_redeploy } = input;
      const res = await http.post<DeployResponse>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/deploy`,
        { instance_id, version_id, force_redeploy: force_redeploy ?? false }
      );
      return res.data;
    },

    async save_workflow_bundle(
      project_id: string,
      input: SaveWorkflowBundleInput
    ): Promise<SaveWorkflowBundleResult> {
      const res = await http.post<SaveWorkflowBundleResponse>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/workflow-bundle`,
        {
          files: input.files,
          dry_run: input.dry_run ?? false,
        }
      );
      return res.data;
    },

    async get_writer(workflow_id: string, options?: GetWriterOptions): Promise<FlowWriter> {
      // Resolve the stream runtime, source bot, and destination queue up front; the rstreams `load`
      // stream (created inside createQueueWriter) owns buffering, batching, backoff, and checkpointing.
      const rsdk = deps?.rsdk ?? (await deps?.get_rsdk?.());
      if (!rsdk) {
        throw new StreamingError(
          'Stream bus configuration missing. Set LEO_* environment variables or add `streams` to ~/.loxtep/config.json. ' +
            'Pass `streams` in LoxtepClientOptions, or ensure your instance stream environment is configured.',
          {
            details: {
              workflow_id,
              hint: 'Run `loxtep init` to configure stream bus, or set LEO_* env vars from your instance.',
            },
          }
        );
      }

      const botId = options?.bot_id;
      if (!botId) {
        throw new StreamingError(
          'workflows.get_writer requires bot_id in options (stream writer identity on the bus).',
          { details: { workflow_id } }
        );
      }

      let queueName = options?.output_queue_name;
      if (!queueName && options?.environment_prefix && options?.project_id) {
        const flowRes = await http.get<{ success: true; data: Flow } | Flow>(
          `${WORKFLOWS_BASE}/${encodeURIComponent(workflow_id)}`
        );
        const flowData =
          flowRes && typeof flowRes === 'object' && 'data' in flowRes
            ? (flowRes as { data: Flow }).data
            : (flowRes as Flow);
        let nodes: FlowNode[] = [];
        try {
          const nodesRes = await http.get<{ success: true; data: { items: FlowNode[] } }>(
            `${WORKFLOWS_BASE}/${encodeURIComponent(workflow_id)}/nodes`
          );
          const payload = (nodesRes as { data?: { items?: FlowNode[] } }).data ?? nodesRes;
          nodes = (payload as { items?: FlowNode[] }).items ?? [];
        } catch {
          /* ignore */
        }
        const flowWithNodes: FlowWithNodes = { ...flowData, nodes };
        queueName = resolveIngestionQueueName(flowWithNodes, options.environment_prefix);
      }
      if (!queueName) {
        throw new StreamingError(
          'workflows.get_writer requires output_queue_name, or environment_prefix + project_id so the SDK can resolve the ingestion queue from the workflow.',
          { details: { workflow_id } }
        );
      }

      const writer = createQueueWriter(
        rsdk,
        botId,
        queueName,
        () =>
          new StreamingError(
            'Cannot write to a closed writer. Create a new writer via workflows.get_writer().',
            { details: { workflow_id } }
          )
      );

      // Optional per-event definition validation wraps the passthrough writer.
      const validate = options?.validate_definition === true && !!options?.definition;
      if (!validate) return writer;
      const onError = options?.on_validation_error ?? 'reject';
      return {
        write(event: unknown, writeOptions?: WriteOptions): void {
          if (options?.definition) {
            const errors = validateEventAgainstDefinition(event, options.definition);
            if (errors.length > 0) {
              if (onError === 'reject') {
                throw new DefinitionValidationError(
                  'Event failed definition validation',
                  options.definition_version ?? '',
                  errors
                );
              }
              if (onError === 'warn') {
                console.warn('[workflows writer] Definition validation failed:', errors);
              }
              if (onError === 'skip') return;
            }
          }
          writer.write(event, writeOptions);
        },
        close: () => writer.close(),
      };
    },
  };
  return api;
}
