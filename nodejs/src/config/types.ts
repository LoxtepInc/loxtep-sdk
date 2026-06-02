import type { ConfigurationResources } from '../rstreams/leo-runtime.js';

/**
 * SDK/CLI config. All fields snake_case per backend conventions.
 * No secrets (token) in config file; token in memory only.
 */
export interface LoxtepConfig {
  /** Base URL of the Loxtep API (e.g. https://apidev.loxtep.io), without the microservice segment. */
  api_url: string;
  /**
   * First path segment for auth (`POST` `/auth/login`, `/auth/refresh`), usually `app` on a shared host.
   * Omitted: defaults to `app`. Set to `""` in config to disable (if `api_url` already includes `/app`).
   */
  auth_path_prefix?: string;
  /**
   * **Legacy** only: one static first segment baked into the SDK client `base_url` (e.g. `dataproducts`).
   * Omit for default **platform** resolution (per-request microservice prefix from each path; see `buildPlatformRequestUrl`).
   */
  api_path_prefix?: string;
  /** Default organization ID (optional). */
  organization_id?: string;
  /** Default project ID (optional). */
  project_id?: string;
  /** Default instance ID (optional). */
  instance_id?: string;
  /**
   * AWS region for SigV4 on Loxtep HTTP requests (e.g. `us-east-1`). Env: `LOXTEP_REGION`.
   * Stream bus region is also set via `streams.Region` / `LEO_REGION` / `AWS_REGION` for `resolveStreamsConfiguration`.
   */
  region?: string;
  /**
   * Partial Loxtep stream bus resource names (merged with `LEO_*` process env by `resolveStreamsConfiguration`).
   * Store as JSON object with PascalCase keys: `Region`, `LeoEvent`, `LeoStream`, etc.
   */
  streams?: Partial<ConfigurationResources>;
}

export const DEFAULT_CONFIG: LoxtepConfig = {
  // Default to the public production API so a fresh install can `loxtep login` with zero config.
  // Override via LOXTEP_API_URL env or `loxtep config set api_url <url>` (e.g. for dev/staging).
  api_url: 'https://api.loxtep.io',
  auth_path_prefix: undefined,
  api_path_prefix: undefined,
  organization_id: undefined,
  project_id: undefined,
  instance_id: undefined,
  region: undefined,
  streams: undefined,
};
