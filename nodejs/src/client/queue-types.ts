/**
 * Queue/stream inspection types. snake_case per backend conventions.
 */

/** Single checkpoint entry (reader position). */
export interface QueueCheckpoint {
  bot_id?: string;
  checkpoint?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Reader info (consumer). */
export interface QueueReader {
  bot_id?: string;
  queue_name?: string;
  checkpoint?: string;
  lag?: number;
  [key: string]: unknown;
}

/** Writer info (producer). */
export interface QueueWriter {
  bot_id?: string;
  queue_name?: string;
  last_event_id?: string;
  [key: string]: unknown;
}

/** Queue metadata (checkpoints, readers, writers, stats). */
export interface QueueMetadata {
  queue_id?: string;
  queue_name?: string;
  checkpoints?: QueueCheckpoint[];
  readers?: QueueReader[];
  writers?: QueueWriter[];
  stats?: {
    head_eid?: string;
    lag_by_reader?: Record<string, number>;
    event_count?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Reader checkpoint response (for get_reader_checkpoint). */
export interface ReaderCheckpoint {
  bot_id: string;
  queue_name: string;
  checkpoint: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Response from GET /observe/queues (list). Botmon returns array of queue info. */
export interface ObserveQueuesListResponse {
  success?: boolean;
  data?: {
    queues?: QueueMetadata[];
    [key: string]: unknown;
  };
  queues?: QueueMetadata[];
  [key: string]: unknown;
}

/** Options for queues.open_reader (start position, batch size). */
export interface QueueReaderOpenOptions {
  start?: string;
  batch_size?: number;
  checkpoint?: string;
}

/** Single event from queue read (same shape as StreamEvent). */
export interface QueueEvent {
  event_id?: string;
  payload?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

/** Handle returned by queues.open_reader; async iterable over queue events. */
export interface QueueReaderHandle {
  /** Live read when LoxtepClient has a configured stream bus; requires bot_id. */
  read(options?: QueueReaderOpenOptions): AsyncIterable<QueueEvent>;
  /** Clean up resources and stop reading. After close(), read() yields no more events. */
  close(): void;
}

/**
 * Options for a single writer `write()`. Callers pass the **business object** to `write()`; the SDK
 * builds the rstreams envelope (source bot = the writer's `bot_id`, `payload` = the business object).
 * Callers never set the envelope/source themselves.
 */
export interface WriteOptions {
  /**
   * Source event time for this record. A ms-epoch number, or any `Date.parse`-able string. Sets the
   * leo envelope's `event_source_timestamp`; if omitted, leo assigns the write time.
   */
  event_source_timestamp?: string | number;
}

/** Handle returned by queues.open_writer; forwards to the rstreams `load` stream (which buffers/flushes). */
export interface QueueWriterHandle {
  /** Write a business object (the SDK builds the envelope; source = writer bot_id). */
  write(event: unknown, options?: WriteOptions): void | Promise<void>;
  close(): Promise<void>;
}
