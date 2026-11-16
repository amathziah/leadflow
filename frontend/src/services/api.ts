const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

/**
 * Thin fetch wrapper returning the server's `{ success, data }` envelope.
 *
 * Failures throw instead of resolving to an empty result, so the UI can tell
 * "the backend is down / rejected this" apart from "there is genuinely no
 * data". Silently swallowing errors into `{ data: [] }` makes a broken system
 * look like an empty one.
 */
async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error(`Cannot reach the LeadFlow API at ${API_BASE}. Is the backend running?`);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || json?.error?.message || json?.error || `Request failed (HTTP ${res.status})`);
  }
  return json as T;
}

// ============================================================================
// LEADFLOW AI TYPES
// ============================================================================

export interface LeadScoreItem {
  factor: string;
  points: number;
  max: number;
  reason: string;
}

export interface CompanySignalItem {
  id: string;
  type: string;
  headline: string;
  detail: string | null;
  source: string;
  sourceUrl?: string | null;
  confidence: number;
  detectedAt: string;
}

export interface ResearchDossierItem {
  summary: string;
  painPoints: Array<string | { area?: string; description?: string; evidence?: string }>;
  strategicSignals: Array<{ signal?: string; relevance?: string; confidence?: number }>;
  qualificationReasons: string[];
  confidenceScore: number;
  generatedAt?: string;
  generatedBy?: 'llm' | 'fallback';
  fallbackReason?: string;
  model?: string;
  agentVersion?: string;
  toolOutputs?: any;
}

export interface AgentStageTraceItem {
  id: string;
  timestamp: string;
  description: string;
  metadata: {
    runId?: string;
    stage?: string;
    status?: 'RUNNING' | 'COMPLETED' | 'FAILED';
    durationMs?: number;
    error?: string;
    [key: string]: any;
  };
}

export interface AgentPipelineRunItem {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface ConfigStatus {
  database: boolean;
  gemini: { configured: boolean };
  smtp: { configured: boolean; host: string | null; port: number; from: string | null };
}

export interface OutreachMessageItem {
  id: string;
  channel: 'EMAIL' | 'LINKEDIN';
  subject: string | null;
  body: string;
  state: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SENT' | 'REJECTED';
  usedSignals: any;
  createdAt?: string;
  approvedAt?: string | null;
  sentAt?: string | null;
  generation?: {
    generatedBy?: 'llm' | 'fallback';
    fallbackReason?: string;
    model?: string;
    usedSignals?: any[];
  } | null;
  lead?: {
    id: string;
    fullName: string;
    email: string | null;
    role: string | null;
    companyName: string;
    company?: {
      signals: CompanySignalItem[];
    };
  };
}

export interface LeadItem {
  id: string;
  fullName: string | null;
  companyName: string;
  email: string | null;
  role: string | null;
  website: string | null;
  industry: string | null;
  leadScore: number | null;
  status: string;
  conversationStage: string;
  company?: {
    id: string;
    domain: string;
    employeeCount: number | null;
    country: string | null;
    fundingStage: string | null;
    technologies: string[];
    signals: CompanySignalItem[];
  };
  scores?: Array<{
    totalScore: number;
    explanation: LeadScoreItem[];
  }>;
  outreachMessages?: OutreachMessageItem[];
  createdAt: string;
}

export interface Lead360Data {
  lead: {
    id: string;
    fullName: string;
    email: string | null;
    role: string | null;
    companyName: string;
    website: string | null;
    industry: string | null;
    country: string | null;
    employeeCount: number | null;
    technologies: string[];
    fundingStage: string | null;
    status: string;
    conversationStage: string;
  };
  score: {
    totalScore: number | null;
    formulaVersion: string;
    scoredAt?: string;
    explanation: LeadScoreItem[];
  };
  signals: CompanySignalItem[];
  research: ResearchDossierItem | null;
  outreach: OutreachMessageItem[];
  history: any[];
  agentTrace: {
    events: AgentStageTraceItem[];
    runs: AgentPipelineRunItem[];
    qualification: { timestamp: string; metadata: any } | null;
    enrichment: Array<{
      field: string;
      value: any;
      source: string;
      confidence: number;
      createdAt: string;
    }>;
  };
}

export interface ManagerDashboardData {
  overview: {
    totalCompanies: number;
    totalLeads: number;
    qualifiedLeads: number;
    // `null` means there is no denominator yet, i.e. genuinely unmeasurable.
    // The UI renders these as an em dash rather than a plausible-looking number.
    averageLeadScore: number | null;
    qualificationRatePercent: number | null;
    responseRatePercent: number | null;
    conversionRatePercent: number | null;
  };
  funnel: Array<{ stage: string; count: number; dropoff: number | null }>;
  outreachPipeline: {
    draftsPendingReview: number;
    inReviewQueue: number;
    approvedReadyToSend: number;
    dispatchedSent: number;
  };
  responseClassifications: {
    interested: number;
    followUp: number;
    notInterested: number;
    unsubscribe: number;
  };
  teamPerformance: Array<{
    userId: string;
    name: string;
    role: string;
    assignedLeadsCount: number;
    reviewedMessagesCount: number;
    averageScore: number;
  }>;
  observability: {
    activeQueueSize: number;
    waiting: number;
    active: number;
    completed: number;
    dlq: number;
    failures: number;
    retries: number;
    leadsProcessed: number;
    averageLatencyMs: number | null;
  };
}

export interface IcpProfileData {
  id: string;
  name: string;
  description: string | null;
  targetIndustries: string[];
  minEmployees: number;
  maxEmployees: number;
  targetCountries: string[];
  targetRoles: string[];
  requiredTechnologies: string[];
  isActive: boolean;
}

// Legacy compatibility types
export interface PricingTier {
  name: string;
  price: string;
  features: string[];
}

export interface CompetitorMetadata {
  techStack?: string[];
  keyFeatures?: string[];
  pricingTiers?: PricingTier[];
  recentUpdates?: string[];
  strengths?: string[];
  weaknesses?: string[];
  targetCustomer?: string;
  keyExecutives?: Array<{ name: string; role: string }>;
  citations?: Array<{ url: string; claim: string }>;
  productOfferings?: string[];
}

export interface Competitor {
  id: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  leadScore: number | null;
  contactName: string | null;
  contactRole: string | null;
  competitiveMoats: string | null;
  metadata: CompetitorMetadata | null;
  createdAt: string;
  updatedAt: string;
  workflowId?: string | null;
  workflow?: { id: string; query: string; targetVertical?: string };
}

export interface Analysis {
  id: string;
  query: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  targetVertical: string | null;
  depth: string;
  error: string | null;
  summary: string | null;
  executiveDossier: string | null;
  confidenceScore: number | null;
  plan: any | null;
  stats: any | null;
  createdAt: string;
  leads?: any[];
  sources?: any[];
  logs?: any[];
}

export interface Workflow {
  id: string;
  query: string;
  depth: string;
  status: string;
  createdAt: string;
  leads: any[];
  sources: any[];
}

export interface ExecutionLog {
  id: string;
  step: string;
  message: string;
  level: string;
  thought?: string | null;
  toolName?: string | null;
  screenshotUrl?: string | null;
  timestamp: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

export const api = {
  // Discovery & Ingest
  async importCsv(csvContent: string, autoProcess = true) {
    return request('/import/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvContent, autoProcess }),
    });
  },

  // ICP
  async fetchIcp(): Promise<{ active: IcpProfileData; all: IcpProfileData[] }> {
    const res = await fetch(`${API_BASE}/icp`);
    const json = await res.json();
    return json.data;
  },

  async updateIcp(id: string, data: Partial<IcpProfileData>) {
    const res = await fetch(`${API_BASE}/icp/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Leads & Pipeline
  async fetchLeads(params?: { status?: string; search?: string; minScore?: number }): Promise<LeadItem[]> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.minScore) query.append('minScore', String(params.minScore));

    const json = await request<{ data?: LeadItem[] }>(`/leads?${query.toString()}`);
    return json.data || [];
  },

  async fetchLead360(id: string): Promise<Lead360Data> {
    const json = await request<{ data: Lead360Data }>(`/leads/${id}/360`);
    return json.data;
  },

  async qualifyLead(id: string) {
    const res = await fetch(`${API_BASE}/leads/${id}/qualify`, { method: 'POST' });
    return res.json();
  },

  async enrichLead(id: string) {
    const res = await fetch(`${API_BASE}/leads/${id}/enrich`, { method: 'POST' });
    return res.json();
  },

  async scoreLead(id: string) {
    const res = await fetch(`${API_BASE}/leads/${id}/score`, { method: 'POST' });
    return res.json();
  },

  async researchLead(id: string) {
    const res = await fetch(`${API_BASE}/leads/${id}/research`, { method: 'POST' });
    return res.json();
  },

  async generateOutreach(id: string) {
    const res = await fetch(`${API_BASE}/leads/${id}/outreach`, { method: 'POST' });
    return res.json();
  },

  async runPipeline(id: string) {
    return request(`/leads/${id}/pipeline`, { method: 'POST' });
  },

  // Human Review & Outreach
  async fetchPendingOutreach(): Promise<OutreachMessageItem[]> {
    const res = await fetch(`${API_BASE}/outreach/pending`);
    const json = await res.json();
    return json.data || [];
  },

  async approveOutreach(id: string, notes?: string, editedSubject?: string, editedBody?: string) {
    const res = await fetch(`${API_BASE}/outreach/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerNotes: notes, editedSubject, editedBody }),
    });
    return res.json();
  },

  async rejectOutreach(id: string, reason: string) {
    const res = await fetch(`${API_BASE}/outreach/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return res.json();
  },

  async dispatchOutreach(id: string) {
    const res = await fetch(`${API_BASE}/outreach/${id}/dispatch`, { method: 'POST' });
    return res.json();
  },

  // Response Simulation & Feedback
  async submitResponse(leadId: string, rawContent: string, messageId?: string) {
    return request(`/leads/${leadId}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawContent, messageId }),
    });
  },

  // Lead Memory Timeline
  async fetchLeadTimeline(id: string) {
    const json = await request<{ data: any }>(`/leads/${id}/timeline`);
    return json.data;
  },

  // Analytics & Observability
  async fetchManagerDashboard(): Promise<ManagerDashboardData> {
    const res = await fetch(`${API_BASE}/analytics/manager`);
    const json = await res.json();
    return json.data;
  },

  async fetchQueueMetrics() {
    const res = await fetch(`${API_BASE}/analytics/queue`);
    const json = await res.json();
    return json.data;
  },

  // Configuration — what is actually wired up right now.
  async fetchConfigStatus(): Promise<ConfigStatus> {
    const json = await request<{ data: ConfigStatus }>('/config/status');
    return json.data;
  },

  async verifySmtp(): Promise<{ ok: boolean; error?: string }> {
    try {
      return await request<{ ok: boolean; error?: string }>('/config/smtp/verify', {
        method: 'POST',
      });
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};
