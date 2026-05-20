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

/** Handle returned by queues.open_writer; buffers then flushes via stream `putEvents`. */
export interface QueueWriterHandle {
  write(event: unknown): Promise<void>;
  close(): Promise<void>;
}
