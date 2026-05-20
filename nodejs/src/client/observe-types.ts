/**
 * Observe API types for status (bots / dashboard). Backend: app /observe/*.
 */

/** Observe status response (GET /observe/bots). Shape is backend-defined; allow extra fields. */
export interface ObserveStatusResponse {
  success: true;
  data: unknown;
}

/**
 * GET /observe/stream-config — proxied Leo/RStreams resource names (PascalCase) for SDK `streams`.
 * Same RBAC as sdk-config (`instances:read` on observe).
 */
export interface ObserveStreamConfigResponse {
  success: true;
  data: Record<string, string>;
}
