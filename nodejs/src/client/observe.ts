/**
 * Observe API: status (bots list / observability summary).
 * Backend: app microservice GET /observe/bots, GET /observe/stream-config.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { ObserveStatusResponse, ObserveStreamConfigResponse } from './observe-types.js';

const OBSERVE_BOTS = '/observe/bots';
const OBSERVE_STREAM_CONFIG = '/observe/stream-config';

/**
 * Create the observe API surface: status.
 */
export function createObserveApi(http: LoxtepHttpClient): {
  status: () => Promise<ObserveStatusResponse['data']>;
  /** Proxied bus resource names for `LoxtepClient({ streams })` (requires instances:read + observe proxy). */
  stream_config: () => Promise<ObserveStreamConfigResponse['data']>;
} {
  return {
    async status(): Promise<ObserveStatusResponse['data']> {
      const res = await http.get<ObserveStatusResponse>(OBSERVE_BOTS);
      return res.data;
    },

    async stream_config(): Promise<ObserveStreamConfigResponse['data']> {
      const res = await http.get<ObserveStreamConfigResponse>(OBSERVE_STREAM_CONFIG);
      return res.data;
    },
  };
}
