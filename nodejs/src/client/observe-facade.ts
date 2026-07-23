/**
 * Observe facade (MCP: loxtep_observe).
 * Extends observe API with public queue read helpers.
 */

import type { createObserveApi } from './observe.js';
import type { createQueuesApi } from './queues.js';

export interface ObserveFacadeDeps {
  observe: ReturnType<typeof createObserveApi>;
  queues: ReturnType<typeof createQueuesApi>;
}

export function createObserveFacade(deps: ObserveFacadeDeps): {
  status: ReturnType<typeof createObserveApi>['status'];
  stream_config: ReturnType<typeof createObserveApi>['stream_config'];
  get_queue_metadata: ReturnType<typeof createQueuesApi>['get_queue_metadata'];
  get_reader_checkpoint: ReturnType<typeof createQueuesApi>['get_reader_checkpoint'];
  open_reader: ReturnType<typeof createQueuesApi>['open_reader'];
  open_writer: ReturnType<typeof createQueuesApi>['open_writer'];
} {
  return {
    status: deps.observe.status.bind(deps.observe),
    stream_config: deps.observe.stream_config.bind(deps.observe),
    get_queue_metadata: deps.queues.get_queue_metadata.bind(deps.queues),
    get_reader_checkpoint: deps.queues.get_reader_checkpoint.bind(deps.queues),
    open_reader: deps.queues.open_reader.bind(deps.queues),
    open_writer: deps.queues.open_writer.bind(deps.queues),
  };
}

export type ObserveFacade = ReturnType<typeof createObserveFacade>;
