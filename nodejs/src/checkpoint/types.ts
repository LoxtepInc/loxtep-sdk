/**
 * Checkpoint types for stream/replay resume. snake_case per conventions.
 */

export interface CheckpointPosition {
  event_id?: string;
  timestamp?: string;
  checkpoint?: string;
  [key: string]: unknown;
}

export interface CheckpointStore {
  save: (checkpoint_id: string, position: CheckpointPosition) => Promise<void>;
  load: (checkpoint_id: string) => Promise<CheckpointPosition | null>;
}
