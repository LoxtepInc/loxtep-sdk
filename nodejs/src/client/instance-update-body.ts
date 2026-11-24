/**
 * Build PUT /organizations/instances/:id body for InstanceUpdateInput.
 * Maps first-class environment_key → metadata.environment_key (open slug; empty/null clears).
 */

import type { InstanceUpdateInput } from "./instances-types.js";

/**
 * Trim + lowercase open segregation key for write.
 * Empty / null → null (clears / env missing). Aliases: staging→stage, production→prod.
 * Not an enum — franchise/location slugs are allowed.
 */
export function normalizeWritableEnvironmentKey(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") {
    throw new TypeError("environment_key must be a string or null");
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "staging") return "stage";
  if (trimmed === "production") return "prod";
  return trimmed;
}

/**
 * Shape the update body sent to the platform. Top-level `environment_key` wins
 * over `metadata.environment_key` when both are present.
 */
export function buildInstanceUpdateBody(
  input: InstanceUpdateInput,
): Record<string, unknown> {
  const { environment_key, metadata, ...rest } = input;
  const body: Record<string, unknown> = { ...rest };

  let nextMeta: Record<string, unknown> | undefined = metadata
    ? { ...metadata }
    : undefined;

  if (environment_key !== undefined) {
    nextMeta = {
      ...(nextMeta ?? {}),
      environment_key: normalizeWritableEnvironmentKey(environment_key),
    };
  } else if (nextMeta && "environment_key" in nextMeta) {
    nextMeta = {
      ...nextMeta,
      environment_key: normalizeWritableEnvironmentKey(
        nextMeta.environment_key as string | null | undefined,
      ),
    };
  }

  if (nextMeta !== undefined) {
    body.metadata = nextMeta;
  }

  return body;
}
