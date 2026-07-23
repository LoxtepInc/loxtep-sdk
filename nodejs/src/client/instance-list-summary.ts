/**
 * Customer-facing subset of instance list rows for CLI / scripts.
 * Full {@link Instance} records include stack_id, connection_details (ARNs), and metadata blobs.
 */

import type { Instance } from './instances-types.js';

/** Fields needed to choose an instance and run `loxtep attach` / deploy. */
export interface InstanceListSummary {
  instance_id: string;
  name: string;
  api_url: string;
  region: string;
  status: string;
  /** shared | managed | self-hosted (backend may emit `customer` for self-hosted). */
  instance_type: string;
}

/** Resolve deployment/connect instance type from metadata or connection_details. */
export function resolveInstanceType(instance: Instance): string {
  const raw =
    (instance.metadata?.instance_type as string | undefined) ??
    (instance.connection_details?.instance_type as string | undefined) ??
    'shared';
  if (raw === 'customer') return 'self-hosted';
  return raw;
}

/** Map a full API instance row to the CLI list summary shape. */
export function toInstanceListSummary(instance: Instance): InstanceListSummary {
  return {
    instance_id: instance.instance_id,
    name: instance.name,
    api_url: instance.api_url,
    region: instance.region,
    status: instance.status,
    instance_type: resolveInstanceType(instance),
  };
}

export function toInstanceListSummaries(instances: Instance[]): InstanceListSummary[] {
  return instances.map(toInstanceListSummary);
}
