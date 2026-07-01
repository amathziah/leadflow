const API_BASE = 'http://localhost:4000/api';

// -----------------------------------------
// Type Definitions
// -----------------------------------------
export type LeadStatus = 'NEW' | 'SCAVENGER_RUNNING' | 'AI_ANALYZING' | 'OUTREACH_READY' | 'OUTREACH_SENT' | 'DISQUALIFIED';
export type WorkflowStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LeadMetadata {
  extractedDescription?: string;
  scrapedTextLength?: number;
  screenshotUrl?: string | null;
  reasoning?: string;
}

export interface Lead {
  id: string;
  companyName: string;
  website: string | null;
  contactName: string | null;
  email: string | null;
  industry: string | null;
  leadScore: number | null;
  status: LeadStatus;
  outreachMessage: string | null;
  contactRole: string | null;
  linkedinUrl: string | null;
  linkedinMessage: string | null;
  metadata: LeadMetadata | null;
  createdAt: string;
  updatedAt: string;
  workflowId: string | null;
}

export interface Workflow {
  id: string;
  query: string;
  status: WorkflowStatus;
  error: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  leads?: Lead[];
  _count?: {
    leads: number;
    logs: number;
  };
}

export interface ExecutionLog {
  id: string;
  step: string;
  message: string;
  level: LogLevel;
  metadata: any | null;
  timestamp: string;
  workflowId: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface LeadsResponse {
  success: boolean;
  data: Lead[];
  pagination: Pagination;
}

export interface LeadResponse {
  success: boolean;
  data: Lead;
}

export interface WorkflowsResponse {
  success: boolean;
  data: Workflow[];
}

export interface WorkflowResponse {
  success: boolean;
  data: Workflow;
}

export interface LogsResponse {
  success: boolean;
  data: ExecutionLog[];
}

// -----------------------------------------
// API Call Methods
// -----------------------------------------
export const api = {
  /**
   * Fetches all leads with optional page, limit, status, industry, and search filters
   */
  async getLeads(filters: {
    status?: string;
    industry?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<LeadsResponse> {
    const queryParams = new URLSearchParams();
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.industry) queryParams.append('industry', filters.industry);
    if (filters.search) queryParams.append('search', filters.search);
    if (filters.page) queryParams.append('page', filters.page.toString());
    if (filters.limit) queryParams.append('limit', filters.limit.toString());

    const response = await fetch(`${API_BASE}/leads?${queryParams.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch leads: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Fetch details of a single lead by its unique UUID
   */
  async getLeadById(id: string): Promise<LeadResponse> {
    const response = await fetch(`${API_BASE}/leads/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch lead profile "${id}": ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Update lead profile values
   */
  async updateLead(id: string, data: Partial<Lead>): Promise<LeadResponse> {
    const response = await fetch(`${API_BASE}/leads/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update lead profile "${id}": ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Delete lead profile from the directory
   */
  async deleteLead(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/leads/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete lead profile "${id}": ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Fetch all workflow history runs
   */
  async getWorkflows(): Promise<WorkflowsResponse> {
    const response = await fetch(`${API_BASE}/workflows`);
    if (!response.ok) {
      throw new Error(`Failed to fetch workflows history: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Fetch single workflow summary details
   */
  async getWorkflowById(id: string): Promise<WorkflowResponse> {
    const response = await fetch(`${API_BASE}/workflows/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch workflow run "${id}": ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Fetch execution logs for a workflow
   */
  async getWorkflowLogs(id: string): Promise<LogsResponse> {
    const response = await fetch(`${API_BASE}/workflows/${id}/logs`);
    if (!response.ok) {
      throw new Error(`Failed to fetch workflow logs "${id}": ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Trigger a brand new scavenger workflow background runner
   */
  async triggerWorkflow(query: string): Promise<WorkflowResponse> {
    const response = await fetch(`${API_BASE}/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      const errPayload = await response.json().catch(() => ({}));
      throw new Error(errPayload.error?.message || `Failed to trigger scavenger workflow: ${response.statusText}`);
    }
    return response.json();
  },
};
