# Shared SDK Resources

This directory contains shared resources used across all SDK implementations:

- **`api-schemas.ts`** — Zod schemas defining the API contract (source of truth for type generation)
- **`openapi/`** — OpenAPI spec (future: auto-generated from backend)
- **`fixtures/`** — Shared test fixtures for integration tests

## Keeping SDKs in sync

When the backend API changes:

1. Update the schemas/spec in this directory
2. Run type generation in each affected SDK
3. Update SDK implementations to match
4. Bump versions and release
