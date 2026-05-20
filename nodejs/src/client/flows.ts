/**
 * Flows API (backend: workflows). list, get (with nodes), create, get_writer.
 * Flow writes for live events use the Loxtep stream data plane — not HTTP POST to /workflows/.../events.
 */

import type { RStreamsSdk } from '../rstreams/leo-runtime.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Flow,
  FlowWithNodes,
  FlowNode,
  FlowsListFilters,
  FlowsListResponse,
  FlowCreateInput,
  FlowWriter,
  GetWriterOptions,
} from './flow-types.js';
import type { DefinitionValidationErrorEntry } from '../errors/types.js';
import { DefinitionValidationError } from '../errors/validation.js';
import { StreamingError } from '../errors/streaming.js';
import { putPayloadsToQueue } from '../rstreams/event-bridge.js';
import { resolveIngestionQueueName } from './flow-queue-resolve.js';

const WORKFLOWS_API_BASE = '/workflows/workflows';

/** Default batch size for FlowWriter flush operations. */
const DEFAULT_BATCH_SIZE = 100;
/** Default flush interval in milliseconds. */
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
/** Default maximum retry attempts for transient write failures. */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Exponential backoff delays (in ms) for retry attempts.
 * Attempt 1: 0ms, Attempt 2: 1000ms, Attempt 3: 2000ms.
 */
const BACKOFF_DELAYS_MS = [0, 1000, 2000];

export interface FlowsApiDeps {
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

/**
 * Flush a single batch to the stream bus with retry and exponential backoff.
 * Retries transient errors up to `maxRetries` attempts.
 * Fails immediately on non-transient errors.
 * Throws StreamingError after all retries are exhausted.
 */
async function flushBatchWithRetry(
  rsdk: RStreamsSdk,
  botId: string,
  queueName: string,
  batch: unknown[],
  maxRetries: number,
  sleepFn: (ms: number) => Promise<void> = sleep
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Apply backoff delay before retry (first attempt has 0ms delay)
      const delay = BACKOFF_DELAYS_MS[attempt] ?? (attempt * 1000);
      await sleepFn(delay);

      await putPayloadsToQueue(rsdk, botId, queueName, batch);
      return; // Success
    } catch (err) {
      lastError = err;

      // Non-transient errors fail immediately — no retry
      if (!isTransientError(err)) {
        throw new StreamingError(
          `Failed to write events: ${err instanceof Error ? err.message : String(err)}`,
          {
            details: {
              attempt: attempt + 1,
              transient: false,
              bot_id: botId,
              queue_name: queueName,
              batch_size: batch.length,
            },
          }
        );
      }
      // Transient error — continue to next retry attempt
    }
  }

  // All retries exhausted
  throw new StreamingError(
    `Failed to write events after ${maxRetries} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    {
      details: {
        attempts: maxRetries,
        transient: true,
        bot_id: botId,
        queue_name: queueName,
        batch_size: batch.length,
      },
    }
  );
}

/**
 * Create the flows API surface (list, get with nodes, create, get_writer).
 */
export function createFlowsApi(
  http: LoxtepHttpClient,
  deps?: FlowsApiDeps
): {
  list: (filters: FlowsListFilters) => Promise<FlowsListResponse['data']>;
  get: (id: string) => Promise<FlowWithNodes>;
  create: (input: FlowCreateInput) => Promise<Flow>;
  get_writer: (flow_id: string, options?: GetWriterOptions) => FlowWriter;
} {
  return {
    async list(filters: FlowsListFilters): Promise<FlowsListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        project_id: filters.project_id,
        page: filters.page ?? 1,
        page_size: filters.page_size ?? 100,
      };
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const qs = buildQueryString(params);
      const res = await http.get<FlowsListResponse>(`${WORKFLOWS_API_BASE}${qs}`);
      return res.data;
    },

    async get(id: string): Promise<FlowWithNodes> {
      const flowRes = await http.get<{ success: true; data: Flow }>(
        `${WORKFLOWS_API_BASE}/${encodeURIComponent(id)}`
      );
      const flow = flowRes.data;
      let nodes: FlowNode[] = [];
      try {
        const nodesRes = await http.get<{ success: true; data: { items: FlowNode[] } }>(
          `${WORKFLOWS_API_BASE}/${encodeURIComponent(id)}/nodes`
        );
        const payload = (nodesRes as { data?: { items?: FlowNode[] } }).data ?? nodesRes;
        nodes = (payload as { items?: FlowNode[] }).items ?? [];
      } catch {
        // Nodes endpoint may not exist or may 404; flow still has node_count
      }
      return { ...flow, nodes };
    },

    async create(input: FlowCreateInput): Promise<Flow> {
      const res = await http.post<{ success: true; data: Flow }>(WORKFLOWS_API_BASE, input);
      return res.data;
    },

    get_writer(flow_id: string, options?: GetWriterOptions): FlowWriter {
      const buffer: unknown[] = [];
      const validate = options?.validate_definition === true && options?.definition;
      const onError = options?.on_validation_error ?? 'reject';
      const batchSize = options?.batch_size ?? DEFAULT_BATCH_SIZE;
      const maxRetries = options?.max_retries ?? DEFAULT_MAX_RETRIES;
      let closed = false;

      return {
        write(event: unknown): void {
          if (closed) {
            throw new StreamingError(
              'Cannot write to a closed FlowWriter. Create a new writer via flows.get_writer().',
              { details: { flow_id } }
            );
          }
          if (validate && options?.definition) {
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
                console.warn('[FlowWriter] Definition validation failed:', errors);
              }
              if (onError === 'skip') {
                return;
              }
            }
          }
          buffer.push(event);
        },
        async close(): Promise<void> {
          if (closed) return;
          closed = true;

          if (buffer.length === 0) {
            buffer.length = 0;
            return;
          }

          const rsdk = deps?.rsdk ?? (await deps?.get_rsdk?.());
          if (!rsdk) {
            buffer.length = 0;
            throw new StreamingError(
              'Stream bus configuration missing. Set LEO_* environment variables or add `streams` to ~/.loxtep/config.json. ' +
              'Pass `streams` in LoxtepClientOptions, or ensure your instance stream environment is configured.',
              {
                details: {
                  flow_id,
                  hint: 'Run `loxtep init` to configure stream bus, or set LEO_* env vars from your instance.',
                },
              }
            );
          }

          const botId = options?.bot_id;
          if (!botId) {
            buffer.length = 0;
            throw new StreamingError(
              'flows.get_writer requires bot_id in options (stream writer identity on the bus).',
              { details: { flow_id } }
            );
          }

          let queueName = options?.output_queue_name;
          if (!queueName && options?.environment_prefix && options?.project_id) {
            const flowRes = await http.get<{ success: true; data: Flow } | Flow>(
              `${WORKFLOWS_API_BASE}/${encodeURIComponent(flow_id)}`
            );
            const flowData =
              flowRes && typeof flowRes === 'object' && 'data' in flowRes
                ? (flowRes as { data: Flow }).data
                : (flowRes as Flow);
            let nodes: FlowNode[] = [];
            try {
              const nodesRes = await http.get<{ success: true; data: { items: FlowNode[] } }>(
                `${WORKFLOWS_API_BASE}/${encodeURIComponent(flow_id)}/nodes`
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
            buffer.length = 0;
            throw new StreamingError(
              'flows.get_writer requires output_queue_name, or environment_prefix + project_id so the SDK can resolve the ingestion queue from the flow.',
              { details: { flow_id } }
            );
          }

          // Drain buffer in batches with retry logic
          const events = [...buffer];
          buffer.length = 0;

          for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            await flushBatchWithRetry(rsdk, botId, queueName, batch, maxRetries);
          }
        },
      };
    },
  };
}
