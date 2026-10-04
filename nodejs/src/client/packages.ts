/**
 * Semantic package lifecycle API.
 * MCP: save/plan/approve/deploy/verify/get_status/import_external_semantic_package
 *   → client.meaning.packages.*
 *
 *   POST /semantic-layer/packages
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { SemanticBundle, SemanticBundleImportResult } from './bundles-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

export interface SaveSemanticPackageInput {
  bundle: SemanticBundle;
  package_id?: string;
  label?: string;
  content_s3_uri?: string;
}

export interface PackageRevisionRef {
  package_id: string;
  revision: number;
  content_hash: string;
}

export interface ImportExternalSemanticPackageInput {
  format:
    | 'r2rml'
    | 'r2rml-turtle'
    | 'json-ld'
    | 'skos-json-ld'
    | 'shacl-json-ld'
    | 'rdf-turtle'
    | 'owl-xml'
    | 'fhir-json';
  content: string | Record<string, unknown> | unknown[];
  package_id?: string;
  label?: string;
  domain_id?: string;
  create_approval?: boolean;
}

export function createPackagesApi(http: LoxtepHttpClient): {
  save: (input: SaveSemanticPackageInput) => Promise<Record<string, unknown>>;
  plan: (input: { package_id: string; revision: number }) => Promise<Record<string, unknown>>;
  approve: (
    input: PackageRevisionRef & { waive_blockers?: boolean; waive_reason?: string }
  ) => Promise<Record<string, unknown>>;
  deploy: (
    input: PackageRevisionRef & { force_replan?: boolean }
  ) => Promise<Record<string, unknown>>;
  verify: (input: {
    package_id: string;
    revision: number;
    include_r2rml?: boolean;
  }) => Promise<Record<string, unknown>>;
  status: (input: {
    package_id: string;
    revision?: number;
  }) => Promise<Record<string, unknown>>;
  import_external: (
    input: ImportExternalSemanticPackageInput
  ) => Promise<Record<string, unknown>>;
} {
  const post = async (body: Record<string, unknown>) => {
    const res = await http.post('/semantic-layer/packages', body);
    return unwrapData<Record<string, unknown>>(res);
  };

  return {
    save: input => post({ action: 'save', ...input }),
    plan: input => post({ action: 'plan', ...input }),
    approve: input => post({ action: 'approve', ...input }),
    deploy: input => post({ action: 'deploy', ...input }),
    verify: input => post({ action: 'verify', ...input }),
    status: input => post({ action: 'status', ...input }),
    import_external: input => post({ action: 'import_external', ...input }),
  };
}

export type PackagesApi = ReturnType<typeof createPackagesApi>;

/** Re-export for callers that stage via bundles.import then packages.approve. */
export type { SemanticBundleImportResult };
