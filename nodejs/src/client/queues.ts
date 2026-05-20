/**
 * Queues API: observe metadata/checkpoints over REST; read/write live events via the Loxtep stream data plane.
 */

import type { RStreamsSdk } from '../rstreams/leo-runtime.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
  QueueMetadata,
  ReaderCheckpoint,
  ObserveQueuesListResponse,
  QueueReaderOpenOptions,
  QueueReaderHandle,
  QueueWriterHandle,
  QueueEvent,
} from './queue-types.js';
import {
  putPayloadsToQueue,
  readQueueBatch,
  type ReadQueueBatchResult,
} from '../rstreams/event-bridge.js';
import { StreamingError } from '../errors/streaming.js';

export interface QueuesApiDeps {
  rsdk?: RStreamsSdk;
  /** Lazy stream runtime resolver (attempts observe.stream_config() when rsdk is not set). */
  get_rsdk?: () => Promise<RStreamsSdk | undefined>;
}

/** Default batch size for QueueReader read operations. */
const DEFAULT_BATCH_SIZE = 100;

/**
 * QueueReader reads events from a queue via the Stream Bus (RStreams SDK).
 *
 * Implements the QueueReaderHandle interface with:
 * - `read()` returning an AsyncIterable<QueueEvent> that yields events in batches
 * - `close()` to clean up resources and stop reading
 *
 * Internal state tracks: bot_id, queue_name, batch_size, last_checkpoint, closed.
 */
export class QueueReader implements QueueReaderHandle {
  private readonly rsdk: RStreamsSdk;
  private readonly bot_id: string;
  private readonly queue_name: string;
  private readonly batch_size: number;
  private last_checkpoint: string | undefined;
  private closed: boolean;

  constructor(
    rsdk: RStreamsSdk,
    bot_id: string,
    queue_name: string,
    options?: QueueReaderOpenOptions & { batch_size?: number }
  ) {
    this.rsdk = rsdk;
    this.bot_id = bot_id;
    this.queue_name = queue_name;
    this.batch_size = options?.batch_size ?? DEFAULT_BATCH_SIZE;
    this.last_checkpoint = options?.start ?? options?.checkpoint ?? undefined;
    this.closed = false;
  }

  /**
   * Read events from the queue as an async iterable.
   * Yields events in batches using `readQueueBatch()` from the Stream Bus.
   * Stops when the queue is exhausted or `close()` has been called.
   *
   * @param readOpts - Optional overrides for batch_size and start position.
   */
  async *read(readOpts?: QueueReaderOpenOptions): AsyncIterable<QueueEvent> {
    if (this.closed) return;

    const batchSize = readOpts?.batch_size ?? this.batch_size;
    let readCursor: string | undefined =
      readOpts?.start ?? readOpts?.checkpoint ?? this.last_checkpoint;

    while (!this.closed) {
      const batch: ReadQueueBatchResult = await readQueueBatch(
        this.rsdk,
        this.bot_id,
        this.queue_name,
        batchSize,
        readCursor ?? null
      );

      const events = batch.events;
      const batchNext = batch.next_start;

      for (const event of events) {
        if (this.closed) return;
        yield event;
      }

      // Update last checkpoint for subsequent reads
      if (batchNext) {
        this.last_checkpoint = batchNext;
      }

      // Stop when queue is exhausted (no events or partial batch)
      if (events.length === 0) break;
      if (!batchNext || events.length < batchSize) break;

      readCursor = batchNext;
    }
  }

  /**
   * Clean up resources and stop reading.
   * After close(), read() yields no more events.
   */
  close(): void {
    this.closed = true;
  }
}

/**
 * Create the queues API surface (get_queue_metadata, get_reader_checkpoint, open_reader, open_writer).
 */
export function createQueuesApi(
  http: LoxtepHttpClient,
  deps?: QueuesApiDeps
): {
  get_queue_metadata: (queue_name: string) => Promise<QueueMetadata>;
  get_reader_checkpoint: (queue_name: string, bot_id: string) => Promise<ReaderCheckpoint>;
  open_reader: (params: {
    bot_id: string;
    queue_name: string;
    options?: QueueReaderOpenOptions;
  }) => Promise<QueueReaderHandle>;
  open_writer: (params: { bot_id: string; queue_name: string }) => Promise<QueueWriterHandle>;
} {
  return {
    async get_queue_metadata(queue_name: string): Promise<QueueMetadata> {
      const res = await http.get<ObserveQueuesListResponse>('/observe/queues');
      const payload = (res as ObserveQueuesListResponse).data ?? res;
      const list =
        (payload as { queues?: QueueMetadata[] }).queues ??
        (res as ObserveQueuesListResponse).queues ??
        (Array.isArray(res) ? res : []);
      const queues = Array.isArray(list) ? list : [];
      const match = queues.find(
        (q: QueueMetadata) =>
          (q.queue_name ?? (q as Record<string, unknown>).name ?? '') === queue_name
      );
      if (match) return match;
      return {
        queue_name,
        checkpoints: [],
        readers: [],
        writers: [],
        stats: {},
      };
    },

    async get_reader_checkpoint(queue_name: string, bot_id: string): Promise<ReaderCheckpoint> {
      const qs = new URLSearchParams({ queue_name, bot_id }).toString();
      const res = await http.get<ReaderCheckpoint>(`/observe/queues/checkpoint?${qs}`);
      return res;
    },

    async open_reader(params: {
      bot_id: string;
      queue_name: string;
      options?: QueueReaderOpenOptions;
    }): Promise<QueueReaderHandle> {
      const { bot_id, queue_name, options } = params;
      const rsdk = deps?.rsdk ?? (await deps?.get_rsdk?.());
      if (!rsdk) {
        throw new StreamingError(
          'Stream bus configuration missing. Set LEO_* environment variables or add `streams` to ~/.loxtep/config.json. ' +
          'Pass `streams` in LoxtepClientOptions, or ensure your instance stream environment is configured.',
          {
            details: {
              bot_id,
              queue_name,
              hint: 'Run `loxtep init` to configure stream bus, or set LEO_* env vars from your instance.',
            },
          }
        );
      }
      return new QueueReader(rsdk, bot_id, queue_name, options);
    },

    async open_writer(params: { bot_id: string; queue_name: string }): Promise<QueueWriterHandle> {
      const { bot_id, queue_name } = params;
      const rsdk = deps?.rsdk ?? (await deps?.get_rsdk?.());
      if (!rsdk) {
        throw new Error(
          'queues.open_writer requires a configured Loxtep stream bus on LoxtepClient (pass `streams` and instance env, or explicit bus config).'
        );
      }
      const buffer: unknown[] = [];
      return {
        async write(event: unknown): Promise<void> {
          buffer.push(event);
        },
        async close(): Promise<void> {
          if (buffer.length === 0) return;
          const events = [...buffer];
          buffer.length = 0;
          await putPayloadsToQueue(rsdk, bot_id, queue_name, events);
        },
      };
    },
  };
}
