/**
 * Pruned list-row shapes for CLI `list` commands.
 * Full API records include metadata blobs, credentials, and cache-only fields — use `get <id>` for those.
 */

import type { ActivityEntry } from './activity-types.js';
import type { DataProduct } from './data-products-types.js';
import type { Domain } from './domains-types.js';
import type { Flow } from './flow-types.js';
import type { Improvement } from './improvements-types.js';
import type { Promise_ } from './promises-types.js';
import type { Project } from './projects-types.js';
import type { Standard } from './standards-types.js';
import type { Trigger } from './trigger-types.js';

export interface DomainListSummary {
  domain_id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  domain_type?: string | null;
  visibility?: string | null;
  instance_id?: string | null;
  parent_domain_id?: string | null;
  is_council: boolean;
  owner_user_id?: string | null;
}

export interface DataProductListSummary {
  data_product_id: string;
  name: string;
  kind?: string;
  status: string;
  domain_id?: string;
  project_id?: string;
}

export interface WorkflowListSummary {
  workflow_id: string;
  name: string;
  project_id: string;
  status: string;
  workflow_type?: string;
  node_count?: number;
}

export interface TriggerListSummary {
  connection_id: string;
  name: string;
  key: string;
  type: string;
  status: string;
  verified: boolean;
  draft: boolean;
}

export interface StandardListSummary {
  standard_id: string;
  name: string;
  status: string;
  type?: string;
  domain_id?: string | null;
  threshold?: number;
  unit?: string;
}

export interface DataContractListSummary {
  contract_id: string;
  name: string;
  data_product_id: string;
  status?: string;
  version?: string;
}

export interface ImprovementListSummary {
  id: string;
  status: string;
  workflow_name: string;
  proposed_change: string;
  rationale: string | null;
}

export interface ActivityListSummary {
  entry_id: string;
  kind: ActivityEntry['kind'];
  timestamp: string;
  operation_name: string;
  actor: string;
  outcome?: ActivityEntry['outcome'];
  source?: ActivityEntry['source'];
  workflow_name?: string;
  target_resource?: string;
  resource_type?: string;
  resource_id?: string;
  skill_name?: string;
}

export interface ProjectListSummary {
  project_id: string;
  name: string;
  status: string;
  description?: string;
  domain_id?: string | null;
  github_repo_name?: string;
  github_repo_url?: string;
}

export function toDomainListSummary(domain: Domain): DomainListSummary {
  return {
    domain_id: domain.domain_id,
    name: domain.name,
    ...(domain.description != null ? { description: domain.description } : {}),
    ...(domain.status != null ? { status: domain.status } : {}),
    ...(domain.domain_type != null ? { domain_type: domain.domain_type } : {}),
    ...(domain.visibility != null ? { visibility: domain.visibility } : {}),
    ...(domain.instance_id != null ? { instance_id: domain.instance_id } : {}),
    ...(domain.parent_domain_id != null ? { parent_domain_id: domain.parent_domain_id } : {}),
    is_council: domain.is_council,
    ...(domain.owner_user_id != null ? { owner_user_id: domain.owner_user_id } : {}),
  };
}

export function toDataProductListSummary(dp: DataProduct): DataProductListSummary {
  return {
    data_product_id: dp.data_product_id,
    name: dp.name,
    status: dp.status,
    ...(dp.kind ? { kind: dp.kind } : {}),
    ...(dp.domain_id ? { domain_id: dp.domain_id } : {}),
    ...(dp.project_id ? { project_id: dp.project_id } : {}),
  };
}

export function toWorkflowListSummary(flow: Flow): WorkflowListSummary {
  const workflowType =
    typeof flow.workflow_type === 'string' ? flow.workflow_type : undefined;
  return {
    workflow_id: flow.workflow_id,
    name: flow.name,
    project_id: flow.project_id,
    status: flow.status,
    ...(workflowType ? { workflow_type: workflowType } : {}),
    ...(flow.node_count != null ? { node_count: flow.node_count } : {}),
  };
}

export function toTriggerListSummary(trigger: Trigger): TriggerListSummary {
  return {
    connection_id: trigger.connection_id,
    name: trigger.name,
    key: trigger.key,
    type: trigger.type,
    status: trigger.status,
    verified: trigger.verified,
    draft: trigger.draft,
  };
}

export function toStandardListSummary(standard: Standard): StandardListSummary {
  return {
    standard_id: standard.standard_id,
    name: standard.name,
    status: standard.status,
    ...(standard.type ? { type: standard.type } : {}),
    ...(standard.domain_id != null ? { domain_id: standard.domain_id } : {}),
    ...(standard.threshold != null ? { threshold: standard.threshold } : {}),
    ...(standard.unit ? { unit: standard.unit } : {}),
  };
}

export function toDataContractListSummary(contract: Promise_): DataContractListSummary {
  return {
    contract_id: contract.contract_id,
    name: contract.name,
    data_product_id: contract.data_product_id,
    ...(contract.status ? { status: contract.status } : {}),
    ...(contract.version ? { version: contract.version } : {}),
  };
}

export function toImprovementListSummary(improvement: Improvement): ImprovementListSummary {
  return {
    id: improvement.id,
    status: improvement.status,
    workflow_name: improvement.workflow_name,
    proposed_change: improvement.proposed_change,
    rationale: improvement.rationale,
  };
}

export function toActivityListSummary(entry: ActivityEntry): ActivityListSummary {
  return {
    entry_id: entry.entry_id,
    kind: entry.kind,
    timestamp: entry.timestamp,
    operation_name: entry.operation_name,
    actor: entry.actor,
    ...(entry.outcome ? { outcome: entry.outcome } : {}),
    ...(entry.source ? { source: entry.source } : {}),
    ...(entry.workflow_name ? { workflow_name: entry.workflow_name } : {}),
    ...(entry.target_resource ? { target_resource: entry.target_resource } : {}),
    ...(entry.resource_type ? { resource_type: entry.resource_type } : {}),
    ...(entry.resource_id ? { resource_id: entry.resource_id } : {}),
    ...(entry.skill_name ? { skill_name: entry.skill_name } : {}),
  };
}

export function toProjectListSummary(project: Project): ProjectListSummary {
  return {
    project_id: project.project_id,
    name: project.name,
    status: project.status,
    ...(project.description ? { description: project.description } : {}),
    ...(project.domain_id != null ? { domain_id: project.domain_id } : {}),
    ...(project.github_repo_name ? { github_repo_name: project.github_repo_name } : {}),
    ...(project.github_repo_url ? { github_repo_url: project.github_repo_url } : {}),
  };
}
