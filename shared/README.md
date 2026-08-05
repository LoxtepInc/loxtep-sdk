# Shared SDK Resources

This directory contains shared resources used across SDK implementations:

- **`api-schemas.ts`** — Zod schemas defining the API contract (source of truth
  for type generation)
- **`fixtures/workspace/`** — Canonical `.loxtep/project.json` + credentials
  shapes for Node/Python `from_workspace` / `fromWorkspace` tests (attach
  contract)

OpenAPI export under `openapi/` is planned; it is not checked in yet.

## Keeping SDKs in sync

When the backend API changes:

1. Update the schemas in this directory
2. Run type generation in each affected SDK
3. Update SDK implementations to match
4. Bump versions and release
