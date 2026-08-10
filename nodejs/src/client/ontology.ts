/**
 * Ontology API (LOX-1241). Concepts CRUD + relationships create/list.
 * MCP: loxtep_meaning ontology_* ops.
 *
 *   GET    /graph/organizations/{org}/ontology/concepts
 *   GET    /graph/organizations/{org}/ontology/concepts/{concept_id}
 *   POST   /graph/organizations/{org}/ontology/concepts
 *   PUT    /graph/organizations/{org}/ontology/concepts/{concept_id}
 *   DELETE /graph/organizations/{org}/ontology/concepts/{concept_id}
 *   GET    /graph/organizations/{org}/ontology/relationships
 *   POST   /graph/organizations/{org}/ontology/relationships
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  OntologyApiDeps,
  OntologyConcept,
  OntologyConceptListResult,
  OntologyCreateConceptInput,
  OntologyCreateRelationshipInput,
  OntologyDeleteConceptResult,
  OntologyGetRelationshipsFilters,
  OntologyListConceptsFilters,
  OntologyRelationship,
  OntologyRelationshipsResult,
  OntologyUpdateConceptInput,
} from './ontology-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(deps: OntologyApiDeps, override?: string): string {
  const org = override ?? deps.organization_id;
  if (!org) {
    throw new Error(
      'organization_id is required for ontology calls (set it on the client or pass it explicitly)'
    );
  }
  return org;
}

function conceptsBase(org: string): string {
  return `/graph/organizations/${encodeURIComponent(org)}/ontology/concepts`;
}

function relationshipsBase(org: string): string {
  return `/graph/organizations/${encodeURIComponent(org)}/ontology/relationships`;
}

export function createOntologyApi(
  http: LoxtepHttpClient,
  deps: OntologyApiDeps = {}
): {
  list_concepts: (filters?: OntologyListConceptsFilters) => Promise<OntologyConceptListResult>;
  get_concept: (concept_id: string, organization_id?: string) => Promise<OntologyConcept>;
  create_concept: (input: OntologyCreateConceptInput) => Promise<OntologyConcept>;
  update_concept: (
    concept_id: string,
    input: OntologyUpdateConceptInput
  ) => Promise<OntologyConcept>;
  delete_concept: (
    concept_id: string,
    organization_id?: string
  ) => Promise<OntologyDeleteConceptResult>;
  create_relationship: (
    input: OntologyCreateRelationshipInput
  ) => Promise<OntologyRelationship>;
  get_relationships: (
    filters?: OntologyGetRelationshipsFilters
  ) => Promise<OntologyRelationshipsResult>;
  /** Alias for get_relationships (GA meaning hub list path). */
  list_relationships: (
    filters?: OntologyGetRelationshipsFilters
  ) => Promise<OntologyRelationshipsResult>;
} {
  const api = {
    async list_concepts(
      filters: OntologyListConceptsFilters = {}
    ): Promise<OntologyConceptListResult> {
      const org = requireOrg(deps, filters.organization_id);
      const search = new URLSearchParams();
      if (filters.namespace) search.set('namespace', filters.namespace);
      if (filters.node_type) search.set('node_type', String(filters.node_type));
      const qs = search.toString();
      const res = await http.get(`${conceptsBase(org)}${qs ? `?${qs}` : ''}`);
      const data = unwrapData<OntologyConceptListResult | OntologyConcept[]>(res);
      if (Array.isArray(data)) {
        return { concepts: data, total: data.length };
      }
      return {
        concepts: data?.concepts ?? [],
        total: data?.total ?? data?.concepts?.length ?? 0,
      };
    },

    async get_concept(concept_id: string, organization_id?: string): Promise<OntologyConcept> {
      if (!concept_id) throw new Error('concept_id is required');
      const org = requireOrg(deps, organization_id);
      const res = await http.get(
        `${conceptsBase(org)}/${encodeURIComponent(concept_id)}`
      );
      return unwrapData<OntologyConcept>(res);
    },

    async create_concept(input: OntologyCreateConceptInput): Promise<OntologyConcept> {
      const org = requireOrg(deps, input.organization_id);
      const body = {
        name: input.name,
        namespace: input.namespace,
        node_type: input.node_type,
        description: input.description,
        uri: input.uri,
        parent_concepts: input.parent_concepts,
      };
      const res = await http.post(conceptsBase(org), body);
      return unwrapData<OntologyConcept>(res);
    },

    async update_concept(
      concept_id: string,
      input: OntologyUpdateConceptInput
    ): Promise<OntologyConcept> {
      if (!concept_id) throw new Error('concept_id is required');
      const org = requireOrg(deps, input.organization_id);
      const body: Record<string, unknown> = {};
      if (input.description !== undefined) body.description = input.description;
      if (input.namespace !== undefined) body.namespace = input.namespace;
      if (input.node_type !== undefined) body.node_type = input.node_type;
      if (input.uri !== undefined) body.uri = input.uri;
      const res = await http.put(
        `${conceptsBase(org)}/${encodeURIComponent(concept_id)}`,
        body
      );
      return unwrapData<OntologyConcept>(res);
    },

    async delete_concept(
      concept_id: string,
      organization_id?: string
    ): Promise<OntologyDeleteConceptResult> {
      if (!concept_id) throw new Error('concept_id is required');
      const org = requireOrg(deps, organization_id);
      const res = await http.delete(
        `${conceptsBase(org)}/${encodeURIComponent(concept_id)}`
      );
      const envelope = res as {
        data?: OntologyConcept;
        warnings?: string[];
      };
      const concept = unwrapData<OntologyConcept>(res);
      return {
        concept,
        warnings: envelope.warnings,
      };
    },

    async create_relationship(
      input: OntologyCreateRelationshipInput
    ): Promise<OntologyRelationship> {
      const org = requireOrg(deps, input.organization_id);
      const body = {
        source_entity_type: input.source_entity_type,
        target_entity_type: input.target_entity_type,
        relation_type: input.relation_type,
        relation_uri: input.relation_uri,
        join_field: input.join_field,
        description: input.description,
      };
      const res = await http.post(relationshipsBase(org), body);
      return unwrapData<OntologyRelationship>(res);
    },

    async get_relationships(
      filters: OntologyGetRelationshipsFilters = {}
    ): Promise<OntologyRelationshipsResult> {
      const org = requireOrg(deps, filters.organization_id);
      const search = new URLSearchParams();
      if (filters.include_discovered !== undefined) {
        search.set('include_discovered', filters.include_discovered ? 'true' : 'false');
      }
      if (filters.limit !== undefined) search.set('limit', String(filters.limit));
      if (filters.source_entity_type) {
        search.set('source_entity_type', filters.source_entity_type);
      }
      if (filters.target_entity_type) {
        search.set('target_entity_type', filters.target_entity_type);
      }
      if (filters.relation_type) search.set('relation_type', filters.relation_type);
      if (filters.namespace) search.set('namespace', filters.namespace);
      const qs = search.toString();
      const res = await http.get(`${relationshipsBase(org)}${qs ? `?${qs}` : ''}`);
      const data = unwrapData<OntologyRelationshipsResult | OntologyRelationship[]>(res);
      if (Array.isArray(data)) {
        return { relationships: data, total: data.length };
      }
      return {
        relationships: data?.relationships ?? [],
        total: data?.total ?? data?.relationships?.length ?? 0,
        source: data?.source,
      };
    },

    list_relationships(
      filters?: OntologyGetRelationshipsFilters
    ): Promise<OntologyRelationshipsResult> {
      return api.get_relationships(filters);
    },
  };

  return api;
}

export type OntologyApi = ReturnType<typeof createOntologyApi>;
