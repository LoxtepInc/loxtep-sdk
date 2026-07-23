/**
 * Session API — org/user context (MCP: loxtep_session).
 * Thin HTTP wrapper; no dedicated microservice module yet.
 */

import type { LoxtepHttpClient } from '../http/client.js';

export interface CurrentUser {
  user_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_id?: string;
  organization_name?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export interface CurrentOrganization {
  organization_id?: string;
  name?: string;
  [key: string]: unknown;
}

export function createSessionApi(http: LoxtepHttpClient): {
  get_current_user: () => Promise<CurrentUser>;
  get_current_organization: () => Promise<CurrentOrganization>;
  logout: () => Promise<{ success: boolean }>;
} {
  return {
    async get_current_user(): Promise<CurrentUser> {
      return http.get<CurrentUser>('/organizations/users/me');
    },

    async get_current_organization(): Promise<CurrentOrganization> {
      const user = await http.get<CurrentUser>('/organizations/users/me');
      const orgId = user.organization_id;
      if (!orgId) {
        throw new Error('organization_id not available on current user');
      }
      const res = await http.get<{ success?: boolean; data?: CurrentOrganization } | CurrentOrganization>(
        `/organizations/organizations/${encodeURIComponent(orgId)}`
      );
      if (res && typeof res === 'object' && 'data' in res && (res as { data?: CurrentOrganization }).data) {
        return (res as { data: CurrentOrganization }).data;
      }
      return res as CurrentOrganization;
    },

    async logout(): Promise<{ success: boolean }> {
      // Hosted MCP invalidates server-side tokens; SDK callers clear local creds separately.
      return { success: true };
    },
  };
}
