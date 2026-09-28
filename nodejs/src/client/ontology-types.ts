/**
 * Ontology concepts + relationships types (LOX-1241).
 * Backend: /graph/organizations/:organization_id/ontology/{concepts,relationships}
 */

export type OntologyNodeType =
  | 'entity'
  | 'microservice'
  | 'taxonomy'
  | 'pattern'
  | 'custom';

export interface OntologyApiDeps {
  organization_id?: string;
}

export interface OntologyConcept {
  concept_id: string;
  organization_id?: string;
  name: string;
  namespace: string;
  node_type: OntologyNodeType | string;
  description?: string;
  uri?: string;
  /** Vocabulary canonical key written by concept registration. */
  canonical_key?: string;
  parent_concepts?: string[];
  created_at?: string;
  updated_at?: string;
  tombstoned_at?: string;
  lifecycle_state?: string | null;
  change_propagation_policy?: string | null;
  owner?: string | null;
  node_id?: string;
}

export interface OntologyConceptListResult {
  concepts: OntologyConcept[];
  total: number;
}

export interface OntologyListConceptsFilters {
  organization_id?: string;
  namespace?: string;
  node_type?: OntologyNodeType | string;
}

export interface OntologyCreateConceptInput {
  name: string;
  namespace: string;
  node_type: OntologyNodeType;
  description?: string;
  uri?: string;
  /** Explicit Vocabulary key; defaults to `${namespace}.${name}` when namespace is dotted. */
  canonical_key?: string;
  aliases?: Array<{ system?: string; path: string }>;
  parent_concepts?: string[];
  organization_id?: string;
}

export interface OntologyUpdateConceptInput {
  description?: string;
  namespace?: string;
  node_type?: OntologyNodeType;
  uri?: string;
  organization_id?: string;
}

export interface OntologyDeleteConceptResult {
  concept: OntologyConcept;
  warnings?: string[];
}

/** Report-first repair: ontology_class nodes → Vocabulary terms. */
export interface OntologyVocabularyRepairInput {
  organization_id?: string;
  dry_run?: boolean;
  namespace?: string;
  limit?: number;
}

export interface OntologyVocabularyRepairResult {
  dry_run: boolean;
  raw_scanned: number;
  tombstoned: number;
  duplicate_node: number;
  eligible: number;
  already_registered: number;
  would_create?: number;
  created?: number;
  failed: Array<{ node_id: string; uri?: string | null; reason: string }>;
  proposed?: Array<{
    node_id: string;
    uri?: string | null;
    canonical_key: string;
    name: string;
    namespace: string;
  }>;
}

export interface OntologyRelationship {
  relationship_id?: string;
  organization_id?: string;
  source_entity_type: string;
  target_entity_type: string;
  relation_type: string;
  relation_uri?: string;
  join_field?: string;
  description?: string;
  created_at?: string;
  source?: 'registry' | 'discovered' | 'authored' | 'merged';
  confidence?: number;
  namespace?: string;
}

export interface OntologyRelationshipsResult {
  relationships: OntologyRelationship[];
  total: number;
  source?: 'registry' | 'discovered' | 'merged';
}

export interface OntologyCreateRelationshipInput {
  source_entity_type: string;
  target_entity_type: string;
  relation_type: string;
  relation_uri?: string;
  join_field?: string;
  description?: string;
  organization_id?: string;
}

export interface OntologyGetRelationshipsFilters {
  organization_id?: string;
  include_discovered?: boolean;
  limit?: number;
  source_entity_type?: string;
  target_entity_type?: string;
  relation_type?: string;
  namespace?: string;
}
