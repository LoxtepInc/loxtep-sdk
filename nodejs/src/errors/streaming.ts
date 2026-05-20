import { LoxtepError } from './base.js';

/** Connection lost, checkpoint failed, etc. */
export class StreamingError extends LoxtepError {
  readonly checkpoint?: string;

  constructor(
    message: string,
    options?: {
      checkpoint?: string;
      details?: Record<string, unknown>;
      request_id?: string;
    }
  ) {
    super(message, {
      code: 'STREAMING_ERROR',
      status_code: 500,
      details: options?.details,
      request_id: options?.request_id,
    });
    this.name = 'StreamingError';
    this.checkpoint = options?.checkpoint;
    Object.setPrototypeOf(this, StreamingError.prototype);
  }
}

/** Failed to save/load checkpoint. */
export class CheckpointError extends LoxtepError {
  readonly checkpoint_id: string;

  constructor(
    message: string,
    checkpoint_id: string,
    options?: { details?: Record<string, unknown>; request_id?: string }
  ) {
    super(message, {
      code: 'CHECKPOINT_ERROR',
      status_code: 500,
      details: options?.details,
      request_id: options?.request_id,
    });
    this.name = 'CheckpointError';
    this.checkpoint_id = checkpoint_id;
    Object.setPrototypeOf(this, CheckpointError.prototype);
  }
}
