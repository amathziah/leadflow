import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { LeadItem, Lead360Data } from '../services/api';
import {
  Filter,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Building2,
  MapPin,
  Users,
  ShieldCheck,
  Send,
  RefreshCw,
  Cpu,
  FileSpreadsheet,
} from 'lucide-react';

export default function LeadPipelineView({
  onOpenOutreachReview,
}: {
  onOpenOutreachReview?: () => void;
}) {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [lead360, setLead360] = useState<Lead360Data | null>(null);
  const [loading360, setLoading360] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadLeads = async () => {
    try {
      setLoading(true);
      const data = await api.fetchLeads({
        status: statusFilter,
        search: searchQuery,
      });
      setLeads(data);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [statusFilter]);

  const handleSelectLead = async (id: string) => {
    setSelectedLeadId(id);
    try {
      setLoading360(true);
      const data = await api.fetchLead360(id);
      setLead360(data);
    } catch (err) {
      console.error('Failed to load lead 360:', err);
    } finally {
      setLoading360(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) return;
    try {
      setLoading(true);
      await api.importCsv(csvText, true);
      setIsCsvModalOpen(false);
      setCsvText('');
      await loadLeads();
    } catch (err) {
      console.error('Failed to import CSV:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunPipeline = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setProcessingId(id);
      await api.runPipeline(id);
      // Brief delay then refresh
      setTimeout(async () => {
        await loadLeads();
        if (selectedLeadId === id) {
          await handleSelectLead(id);
        }
        setProcessingId(null);
      }, 2500);
    } catch (err) {
      console.error('Pipeline error:', err);
      setProcessingId(null);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-400 bg-slate-800/60 border-slate-700';
    if (score >= 85) return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80';
    if (score >= 70) return 'text-amber-400 bg-amber-950/60 border-amber-800/80';
    return 'text-rose-400 bg-rose-950/60 border-rose-800/80';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'QUALIFIED':
        return <span className="badge badge-success"><CheckCircle2 size={12} className="mr-1" /> Qualified</span>;
      case 'DISQUALIFIED':
        return <span className="badge badge-danger"><XCircle size={12} className="mr-1" /> Disqualified</span>;
      case 'OUTREACH_READY':
      case 'OUTREACH_PENDING_APPROVAL':
        return <span className="badge badge-warning"><Clock size={12} className="mr-1" /> Review Ready</span>;
      case 'OUTREACH_SENT':
        return <span className="badge badge-primary"><Send size={12} className="mr-1" /> Dispatched</span>;
      case 'RESPONDED':
        return <span className="badge badge-accent"><Sparkles size={12} className="mr-1" /> Responded</span>;
      default:
        return <span className="badge badge-neutral">Candidate</span>;
    }
  };

  return (
    <div className="lead-pipeline-page">
      {/* Header Bar */}
      <div className="pipeline-header">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="text-indigo-400" size={26} />
            Lead Intelligence Pipeline
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Raw Companies → Verified Signals → Deterministic ICP → Multi-Factor Scoring → AI Personalization
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <FileSpreadsheet size={16} /> Import CSV
          </button>
          <button
            onClick={loadLeads}
            className="btn btn-secondary p-2.5"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search company, person, title, or industry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadLeads()}
          />
        </div>

        <div className="filter-pills">
          <Filter size={14} className="text-slate-500 mr-1" />
          {['ALL', 'CANDIDATE', 'QUALIFIED', 'OUTREACH_READY', 'OUTREACH_SENT', 'RESPONDED', 'DISQUALIFIED'].map((status) => (
            <button
              key={status}
              className={`pill ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Left List + Right Lead 360 */}
      <div className="pipeline-grid">
        {/* Left Column: Lead Cards */}
        <div className="leads-list-column">
          {loading && leads.length === 0 ? (
            <div className="empty-state">
              <RefreshCw size={32} className="animate-spin text-indigo-400 mb-2" />
              <p>Loading candidate leads...</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="empty-state">
              <Building2 size={40} className="text-slate-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-300">No leads found</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1 mb-4">
                Import a CSV of companies to get started. Define who you sell to in
                ICP Studio first so leads are qualified as they arrive.
              </p>
              <button onClick={() => setIsCsvModalOpen(true)} className="btn btn-primary text-sm">
                Import CSV
              </button>
            </div>
          ) : (
            leads.map((lead) => {
              const isSelected = selectedLeadId === lead.id;
              const isProcessing = processingId === lead.id;

              return (
                <div
                  key={lead.id}
                  className={`lead-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectLead(lead.id)}
                >
                  {/* Identity row. `min-w-0` lets the long names actually
                      truncate instead of forcing the badges to wrap — without
                      it, flex children refuse to shrink below their content. */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4
                        className="font-semibold text-white text-base truncate"
                        title={lead.companyName}
                      >
                        {lead.companyName}
                      </h4>
                      <p
                        className="text-sm text-slate-300 font-medium mt-0.5 truncate"
                        title={`${lead.fullName || 'Target Lead'}${lead.role ? ` · ${lead.role}` : ''}`}
                      >
                        {lead.fullName || 'Target Lead'}
                        {lead.role && <span className="text-slate-400 font-normal"> · {lead.role}</span>}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div
                        className={`score-badge border px-2.5 py-0.5 rounded-full font-bold text-xs whitespace-nowrap ${getScoreColor(lead.leadScore)}`}
                      >
                        {lead.leadScore !== null ? `${lead.leadScore}/100` : 'Unscored'}
                      </div>
                      {getStatusBadge(lead.status)}
                    </div>
                  </div>

                  {/* Attributes & Signals preview */}
                  <div className="card-attributes mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                      {lead.company?.country && (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <MapPin size={12} /> {lead.company.country}
                        </span>
                      )}
                      {lead.company?.employeeCount && (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Users size={12} /> {lead.company.employeeCount.toLocaleString()}
                        </span>
                      )}
                      {lead.industry && <span className="truncate">{lead.industry}</span>}
                      {lead.company?.fundingStage && (
                        <span className="text-emerald-400 font-medium whitespace-nowrap">
                          {lead.company.fundingStage}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={(e) => handleRunPipeline(lead.id, e)}
                      disabled={isProcessing}
                      className="btn-text-action text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0 whitespace-nowrap disabled:opacity-60"
                      title="Enrich, detect signals, qualify, score, research and draft outreach"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" /> Processing...
                        </>
                      ) : (
                        <>
                          <Cpu size={12} /> Run Pipeline
                        </>
                      )}
                    </button>
                  </div>

                  {/* Signal pills */}
                  {lead.company?.signals && lead.company.signals.length > 0 && (
                    <div className="signal-mini-tags mt-2 flex flex-wrap gap-1.5">
                      {lead.company.signals.slice(0, 2).map((sig) => (
                        <span key={sig.id} className="signal-pill">
                          ⚡ {sig.headline.slice(0, 36)}...
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Lead 360 View */}
        <div className="lead-360-column">
          {loading360 ? (
            <div className="empty-state">
              <RefreshCw size={36} className="animate-spin text-indigo-400 mb-2" />
              <p>Synthesizing Lead 360 Intelligence...</p>
            </div>
          ) : !lead360 ? (
            <div className="empty-state">
              <Cpu size={44} className="text-slate-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-300">Select a lead to inspect 360° dossier</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">
                View deterministic qualification rules, multi-factor score breakdown, verified evidence, and AI outreach drafts.
              </p>
            </div>
          ) : (
            <div className="lead-360-container">
              {/* Profile Header Card */}
              <div className="dossier-card header-dossier">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      {lead360.lead.companyName}
                      <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                        {lead360.lead.industry || 'B2B SaaS'}
                      </span>
                    </h2>
                    <p className="text-slate-300 font-medium text-sm mt-0.5">
                      {lead360.lead.fullName} — <span className="text-indigo-400">{lead360.lead.role}</span>
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                      {lead360.lead.country && <span>📍 {lead360.lead.country}</span>}
                      {lead360.lead.employeeCount && <span>👥 {lead360.lead.employeeCount} Employees</span>}
                      {lead360.lead.fundingStage && <span className="text-emerald-400 font-semibold">💰 {lead360.lead.fundingStage}</span>}
                      {lead360.lead.website && (
                        <a href={lead360.lead.website} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                          🔗 {lead360.lead.website.replace('https://', '')}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`score-badge-large ${getScoreColor(lead360.score.totalScore)}`}>
                      <span className="text-2xl font-black">{lead360.score.totalScore ?? '—'}</span>
                      <span className="text-xs font-semibold opacity-80">/ 100</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 font-mono">
                      Formula: {lead360.score.formulaVersion}
                    </div>
                  </div>
                </div>
              </div>

              {/* Explainable Scoring Breakdown */}
              <div className="dossier-card">
                <h3 className="section-title">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  Deterministic & Multi-Factor Scoring Breakdown
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
                  {lead360.score.explanation && lead360.score.explanation.length > 0 ? (
                    lead360.score.explanation.map((item, idx) => (
                      <div key={idx} className="score-factor-row">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200">{item.factor}</span>
                          <span className="font-bold text-emerald-400">+{item.points} / {item.max} pts</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{item.reason}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">Run scoring to calculate itemized factors.</p>
                  )}
                </div>
              </div>

              {/* Verified Business Signals */}
              <div className="dossier-card">
                <h3 className="section-title">
                  <TrendingUp size={16} className="text-amber-400" />
                  Verified Market Signals ({lead360.signals.length})
                </h3>
                <div className="signals-grid mt-3">
                  {lead360.signals.length === 0 ? (
                    <p className="text-xs text-slate-500">No signals detected yet. Run Signal Engine.</p>
                  ) : (
                    lead360.signals.map((sig) => (
                      <div key={sig.id} className="signal-card">
                        <div className="flex items-center justify-between text-xs">
                          <span className="signal-type-tag">{sig.type.replace('_', ' ')}</span>
                          <span className="text-xs text-slate-400">
                            Confidence: <strong className="text-emerald-400">{Math.round(sig.confidence * 100)}%</strong>
                          </span>
                        </div>
                        <h4 className="font-semibold text-sm text-slate-200 mt-1">{sig.headline}</h4>
                        {sig.detail && <p className="text-xs text-slate-400 mt-1">{sig.detail}</p>}
                        <div className="source-footnote mt-2 text-xs text-slate-500">
                          Source: <em>{sig.source}</em>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* AI Research Agent Dossier */}
              {lead360.research && (
                <div className="dossier-card">
                  <h3 className="section-title">
                    <Cpu size={16} className="text-indigo-400" />
                    AI Research Agent Dossier (Confidence: {Math.round(lead360.research.confidenceScore * 100)}%)
                  </h3>
                  <p className="text-sm text-slate-300 mt-2 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                    {lead360.research.summary}
                  </p>

                  {/* Pain points */}
                  <div className="mt-3">
                    <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Identified Operational Pain Points:
                    </h5>
                    <div className="space-y-1.5 mt-1.5">
                      {lead360.research.painPoints?.map((pp: any, i: number) => (
                        <div key={i} className="text-xs p-2 rounded bg-slate-900/40 border border-slate-800 text-slate-300">
                          <strong className="text-amber-400">{pp.area || `Point ${i + 1}`}:</strong> {pp.description || pp}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Generated Outreach & Human Review CTA */}
              <div className="dossier-card">
                <div className="flex items-center justify-between">
                  <h3 className="section-title">
                    <Send size={16} className="text-indigo-400" />
                    Signal-Grounded Outreach Draft
                  </h3>
                  {onOpenOutreachReview && (
                    <button
                      onClick={onOpenOutreachReview}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                    >
                      Open Human Review Center <ArrowRight size={12} />
                    </button>
                  )}
                </div>

                {lead360.outreach.length === 0 ? (
                  <div className="text-xs text-slate-500 mt-2">
                    No outreach generated yet. Trigger pipeline to draft evidence-based copy.
                  </div>
                ) : (
                  <div className="outreach-preview-box mt-3">
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                      <span className="font-semibold text-slate-300">
                        Subject: {lead360.outreach[0].subject || 'Scaling Finance Operations'}
                      </span>
                      <span className="badge badge-warning">{lead360.outreach[0].state}</span>
                    </div>
                    <p className="text-xs text-slate-300 whitespace-pre-line mt-2 font-mono leading-relaxed">
                      {lead360.outreach[0].body}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CSV Import Modal */}
      {isCsvModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h3 className="text-lg font-bold text-white mb-2">Bulk Ingest Candidate Leads (CSV)</h3>
            <p className="text-xs text-slate-400 mb-3">
              Paste standard CSV rows with columns: Company Name, Domain, Industry, Employees, Country, Role, Contact Name, Email.
            </p>
            <textarea
              className="csv-textarea"
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`Company Name,Domain,Industry,Employees,Country,Role,Contact Name,Email
Acme Cloud,acmecloud.io,B2B SaaS,180,US,CFO,John Doe,john@acmecloud.io`}
            />
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsCsvModalOpen(false)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleImportCsv}
                className="btn btn-primary text-sm"
                disabled={!csvText.trim()}
              >
                Ingest & Process
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
