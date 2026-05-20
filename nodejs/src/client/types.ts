import type { ConfigurationResources, LoxtepStreamRuntime } from '../rstreams/leo-runtime.js';

/**
 * Client options. All API-facing fields use snake_case per backend conventions.
 */
export interface LoxtepClientOptions {
  /** Base URL of the Loxtep API (e.g. https://apidev.loxtep.io) without a trailing microservice segment. */
  api_url: string;
  /**
   * **Legacy** (`url_resolution: 'legacy'` only): a single first path segment prepended to `api_url` for all REST calls
   * (e.g. `dataproducts` when the whole process only talks to that microservice). Ignored in `platform` mode.
   */
  api_path_prefix?: string;
  /**
   * - `platform` (default): `api_url` is the **origin** only; each request path is resolved per microservice
   *   (see `buildPlatformRequestUrl` in `config/platform-request-url.ts`).
   * - `legacy`: one static `base_url` = `api_url` + optional `api_path_prefix` (older tests and monolithic base URLs).
   */
  url_resolution?: 'platform' | 'legacy';
  /** Authentication: JWT token or credentials for login. */
  auth: AuthOptions;
  /** Optional token getter for HTTP client (overrides auth when set). Used by CLI with stored credentials. */
  get_token?: () => Promise<string | null>;
  /** AWS region for SigV4 signing (default: us-east-1). */
  region?: string;
  /** Default organization ID (optional). */
  organization_id?: string;
  /** Default project ID (optional). */
  project_id?: string;
  /** Default instance ID (deploy / instance-scoped APIs). */
  instance_id?: string;
  /**
   * Loxtep stream bus configuration; merged with instance env / `AWS_REGION` (see `resolveStreamsConfiguration`).
   * When resolved, live flows, queues, and `data_products.stream` use the stream data plane.
   */
  streams?: Partial<ConfigurationResources>;
  /**
   * Pre-built stream runtime (skips env merge). Prefer `streams` + env in production; use for tests or custom wiring.
   */
  streams_sdk?: LoxtepStreamRuntime;
  /**
   * @deprecated Use `streams` — same bus configuration shape.
   */
  rstreams?: Partial<ConfigurationResources>;
  /**
   * @deprecated Use `streams_sdk` — pre-built stream runtime.
   */
  rstreams_sdk?: LoxtepStreamRuntime;
  /**
   * After a 401, invoked once to refresh JWT; return true if the client should retry the request.
   */
  refresh_auth?: () => Promise<boolean>;
  /** Optional metrics reporting config. */
  metrics?: MetricsOptions;
  /** Optional fetch implementation (for tests or custom HTTP). */
  fetch_fn?: typeof fetch;
  /** Optional AWS credentials (for tests; avoids credential provider chain). */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
}

/**
 * Auth: JWT token or email/password for token exchange.
 */
export type AuthOptions =
  | { type: 'jwt'; token: string }
  | {
      type: 'credentials';
      email: string;
      password: string;
      organization_id?: string;
    };

export interface MetricsOptions {
  enabled?: boolean;
  reporter?: 'aws' | 'datadog' | 'custom';
  tags?: Record<string, string>;
}
