/**
 * Connectors API types.
 * Backend: connectors microservice /connectors/connectors.
 */

export interface Connector {
  connector_id: string;
  owner_user_id: string;
  organization_id: string;
  connector_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConnectorShare {
  connector_share_id: string;
  connector_id: string;
  share_scope: 'user' | 'role' | 'domain' | 'organization';
  share_target_id: string;
  permission: 'read' | 'write' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface ConnectorsListFilters {
  organization_id?: string;
  connector_type?: string;
  page?: number;
  page_size?: number;
  sort_by?: 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

export interface ConnectorsListResponse {
  success: true;
  items: Connector[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface CreateConnectorInput {
  connector_type: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConnectorInput {
  connector_type?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorTestResult {
  passed: boolean;
  message?: string;
  details?: Record<string, unknown>;
  error?: { code: string; message: string };
  tested_at: string;
}
