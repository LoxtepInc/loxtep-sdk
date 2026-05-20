/**
 * Procedures API types.
 * Backend: process-intelligence microservice /process-intelligence/organizations/:organization_id/procedures.
 */

export interface Procedure {
  procedure_id: string;
  name: string;
  description: string | null;
  frequency: number;
  confidence: number;
  systems: string[];
}

export interface ProceduresListResponse {
  success: true;
  data: {
    items: Procedure[];
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
    };
  };
}
