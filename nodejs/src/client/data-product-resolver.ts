/**
 * DataProductResolver — resolves a data product name or UUID into fully-qualified
 * runtime configuration (queue, bot_id, stream bus resources).
 *
 * Resolution chain:
 * 1. Resolve data product (by UUID direct lookup or name search)
 * 2. Extract runtime bindings (deployment_bindings)
 * 3. Resolve stream config from instance record
 *
 * Results are cached in-memory keyed by both name and ID.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { DataProduct, DataProductsListResponse } from './data-products-types.js';
import { NotFoundError } from '../errors/resource.js';
import { StreamingError } from '../errors/streaming.js';
import { LoxtepError } from '../errors/base.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ResolvedDataProduct {
  data_product_id: string;
  name: string;
  queue_name: string;
  bot_id: string;
  instance_id: string;
  workflow_id: string;
  deployment_id: string;
}

export interface ResolvedStreamConfig {
  Region: string;
  LeoEvent: string;
  LeoStream: string;
  LeoCron: string;
  LeoS3: string;
  LeoKinesisStream: string;
  LeoFirehoseStream: string;
  LeoSettings: string;
}

export interface FullResolution {
  dataProduct: ResolvedDataProduct;
  streamConfig: ResolvedStreamConfig;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Thrown when multiple data products match a name search (ambiguous). */
export class AmbiguityError extends LoxtepError {
  readonly matches: Array<{ data_product_id: string; instance_id?: string }>;

  constructor(
    message: string,
    matches: Array<{ data_product_id: string; instance_id?: string }>,
    options?: { details?: Record<string, unknown>; request_id?: string }
  ) {
    super(message, {
      code: 'AMBIGUITY_ERROR',
      status_code: 409,
      details: options?.details,
      request_id: options?.request_id,
    });
    this.name = 'AmbiguityError';
    this.matches = matches;
    Object.setPrototypeOf(this, AmbiguityError.prototype);
  }
}

// ─── UUID detection ──────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolves data product identifiers (name or UUID) into full runtime configuration
 * including queue name, bot_id, and stream bus resources.
 */
export class DataProductResolver {
  private cache = new Map<string, FullResolution>();

  constructor(
    private readonly http: LoxtepHttpClient,
    private readonly clientInstanceId?: string
  ) {}

  /**
   * Full resolution chain: data product → runtime bindings → stream config.
   * Results are cached by both name and ID for subsequent calls.
   */
  async resolve(idOrName: string): Promise<FullResolution> {
    const cacheKey = idOrName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Step 1: Resolve data product record with runtime bindings
    const dp = await this.resolveDataProduct(idOrName);

    // Step 2: Resolve stream config from instance
    const streamConfig = await this.resolveStreamConfig(dp.instance_id);

    const result: FullResolution = { dataProduct: dp, streamConfig };

    // Cache by the original key, by ID, and by name
    this.cache.set(cacheKey, result);
    this.cache.set(dp.data_product_id.toLowerCase(), result);
    this.cache.set(dp.name.toLowerCase(), result);

    return result;
  }

  /**
   * Invalidate cached resolution. If no argument is provided, clears all cached entries.
   * If a specific name or ID is provided, removes only that entry.
   */
  invalidate(idOrName?: string): void {
    if (!idOrName) {
      this.cache.clear();
      return;
    }
    this.cache.delete(idOrName.toLowerCase());
  }

  /**
   * Return the first cached stream config (if any resolution has been performed).
   * Used by LoxtepClient.resolve_stream_sdk() to reuse stream config from a prior
   * data product resolution without making additional API calls.
   */
  getCachedStreamConfig(): ResolvedStreamConfig | undefined {
    for (const entry of this.cache.values()) {
      return entry.streamConfig;
    }
    return undefined;
  }

  /**
   * Resolve a data product by UUID (direct GET) or by name (search + exact match).
   * Throws NotFoundError if no match, AmbiguityError if multiple matches.
   */
  private async resolveDataProduct(idOrName: string): Promise<ResolvedDataProduct> {
    const isUuid = UUID_REGEX.test(idOrName);

    if (isUuid) {
      const res = await this.http.get<{ success: true; data: DataProduct }>(
        `/dataproducts/${encodeURIComponent(idOrName)}`
      );
      return this.extractRuntimeBindings(res.data);
    }

    // Search by name, scoped to instance if configured
    const params = new URLSearchParams({ search: idOrName });
    if (this.clientInstanceId) {
      params.set('instance_id', this.clientInstanceId);
    }
    const qs = params.toString();
    const res = await this.http.get<DataProductsListResponse>(`/dataproducts?${qs}`);

    const matches = res.data.items.filter(dp => dp.name === idOrName);

    if (matches.length === 0) {
      throw new NotFoundError(
        `Data product '${idOrName}' not found. Verify the name is correct and that the workflow has been deployed.`,
        'data_product',
        idOrName,
        {
          details: {
            searched_name: idOrName,
            instance_id: this.clientInstanceId ?? null,
            hint: 'Check the data product name or use the UUID directly. Ensure the workflow containing this data product has been deployed.',
          },
        }
      );
    }

    if (matches.length > 1) {
      const matchInfo = matches.map(dp => ({
        data_product_id: dp.data_product_id,
        instance_id: dp.deployment_bindings?.instance_id,
      }));
      throw new AmbiguityError(
        `Multiple data products match name '${idOrName}'. Specify an instance_id in the client config or use the data product UUID directly.`,
        matchInfo,
        {
          details: {
            searched_name: idOrName,
            match_count: matches.length,
            matches: matchInfo,
            hint: 'Set instance_id in LoxtepClient options to scope the search, or use the data_product_id UUID.',
          },
        }
      );
    }

    return this.extractRuntimeBindings(matches[0]);
  }

  /**
   * Extract and validate runtime bindings from a data product record.
   * Falls back to deriving bindings from storage.rstreams_queue when
   * deployment_bindings is not yet populated (pre-existing deployments).
   * Throws StreamingError if the data product has not been deployed.
   */
  private extractRuntimeBindings(dp: DataProduct): ResolvedDataProduct {
    const bindings = dp.deployment_bindings;
    if (bindings?.queue_name && bindings?.bot_id && bindings?.instance_id) {
      return {
        data_product_id: dp.data_product_id,
        name: dp.name,
        queue_name: bindings.queue_name,
        bot_id: bindings.bot_id,
        instance_id: bindings.instance_id,
        workflow_id: (dp as DataProduct & { workflow_id?: string }).workflow_id ?? '',
        deployment_id: bindings.deployment_id,
      };
    }

    // Fallback: derive from storage.rstreams_queue for data products deployed before
    // deployment_bindings was introduced.
    const storage = dp.storage as Record<string, unknown> | undefined;
    const queueName = storage?.rstreams_queue as string | undefined;

    if (!queueName) {
      throw new StreamingError(
        `Data product '${dp.name}' (${dp.data_product_id}) is not deployed. Deploy the workflow first.`,
        {
          details: {
            data_product_id: dp.data_product_id,
            name: dp.name,
            hint: "Use 'deploy_workflow' or 'deploy_project' to deploy the workflow containing this data product.",
          },
        }
      );
    }

    // Derive instance_id from partial bindings or metadata
    const metadata = dp.metadata as Record<string, unknown> | undefined;
    const instanceId =
      bindings?.instance_id ||
      (metadata?.instance_id as string | undefined) ||
      this.clientInstanceId;

    if (!instanceId) {
      throw new StreamingError(
        `Data product '${dp.name}' (${dp.data_product_id}) has a queue binding but no instance_id. ` +
          `Set instance_id in LoxtepClient options or redeploy the workflow.`,
        {
          details: {
            data_product_id: dp.data_product_id,
            name: dp.name,
            queue_name: queueName,
            hint: "Set instance_id in LoxtepClient options, or redeploy the workflow to populate deployment_bindings.",
          },
        }
      );
    }

    // Require bot_id from bindings — a synthetic bot_id won't match the instance
    // namespace filter in the stats Lambda, making writes invisible in Observe.
    // If bot_id is missing, the workflow needs to be redeployed.
    const botId = bindings?.bot_id;
    if (!botId) {
      throw new StreamingError(
        `Data product '${dp.name}' (${dp.data_product_id}) is missing deployment_bindings.bot_id. ` +
          `Redeploy the workflow to populate deployment_bindings.`,
        {
          details: {
            data_product_id: dp.data_product_id,
            name: dp.name,
            queue_name: queueName,
            instance_id: instanceId,
            hint: "Use 'deploy_workflow' or 'deploy_project' to redeploy. The deployment will populate the correct bot_id for SDK writes.",
          },
        }
      );
    }

    return {
      data_product_id: dp.data_product_id,
      name: dp.name,
      queue_name: queueName,
      bot_id: botId,
      instance_id: instanceId,
      workflow_id: (dp as DataProduct & { workflow_id?: string }).workflow_id ?? '',
      deployment_id: bindings?.deployment_id ?? '',
    };
  }

  /**
   * Resolve stream bus configuration from the instance record.
   * Tries GET /organizations/instances/{id}/stream-config first, then falls back to
   * GET /observe/stream-config (accessible with standard developer tokens).
   */
  private async resolveStreamConfig(instanceId: string): Promise<ResolvedStreamConfig> {
    // Primary: organizations microservice stream-config endpoint
    try {
      const res = await this.http.get<{ success: true; data: ResolvedStreamConfig }>(
        `/organizations/instances/${encodeURIComponent(instanceId)}/stream-config`
      );
      if (res?.data && typeof res.data === 'object' && 'LeoEvent' in res.data) {
        return res.data;
      }
    } catch {
      // Fall through to observe endpoint
    }

    // Fallback: observe stream-config endpoint (proxied, accessible to developer-role tokens)
    try {
      const res = await this.http.get<{ success: true; data: ResolvedStreamConfig }>(
        `/observe/stream-config`
      );
      if (res?.data && typeof res.data === 'object' && 'LeoEvent' in res.data) {
        return res.data;
      }
    } catch {
      // Fall through to error
    }

    throw new StreamingError(
      `Unable to resolve stream configuration for instance '${instanceId}'. ` +
        `Ensure the instance is provisioned and you have access to the stream-config endpoint.`,
      {
        details: {
          instance_id: instanceId,
          hint: 'Check that your token has instances:read permission, or configure streams directly in LoxtepClient options.',
        },
      }
    );
  }
}
