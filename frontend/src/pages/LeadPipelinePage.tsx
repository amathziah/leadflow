import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { LeadItem, Lead360Data } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import AgentRunTrace from '../components/AgentRunTrace';
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
  Globe,
  DollarSign,
  Zap,
  ExternalLink,
} from 'lucide-react';

export default function LeadPipelinePage({
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
      if (data.length > 0 && !selectedLeadId) {
        handleSelectLead(data[0].id);
      }
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

  const handleRunPipeline = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setProcessingId(id);
      const queued = await api.runPipeline(id);
      if (!queued?.success || !queued?.data?.jobId) {
        throw new Error(queued?.error || queued?.message || 'The pipeline could not be queued.');
      }
      const jobId = queued.data.jobId as string;
      const pollForProgress = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1400));
        await loadLeads();
        if (selectedLeadId === id) {
          try {
            const latestTrace = await api.fetchLead360(id);
            setLead360(latestTrace);
            const run = latestTrace.agentTrace.runs.find((item) => item.id === jobId);
            if (run && ['WAITING', 'ACTIVE'].includes(run.status)) {
              setTimeout(pollForProgress, 1400);
              return;
            }
          } catch (traceError) {
            console.error('Failed to refresh agent run trace:', traceError);
          }
        }
        setProcessingId(null);
      };
      setTimeout(pollForProgress, 900);
    } catch (err) {
      console.error('Pipeline error:', err);
      setProcessingId(null);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-600 bg-slate-100 border-slate-200';
    if (score >= 85) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 70) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
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

  // Quick stats computed from current leads list
  const totalCount = leads.length;
  const qualifiedCount = leads.filter((l) => l.status === 'QUALIFIED').length;
  const reviewCount = leads.filter((l) => l.status === 'OUTREACH_READY' || l.status === 'OUTREACH_PENDING_APPROVAL').length;
  const dispatchedCount = leads.filter((l) => l.status === 'OUTREACH_SENT' || l.status === 'RESPONDED').length;

  return (
    <div className="lead-pipeline-page">
      {/* Header Bar */}
      <PageHeader
        eyebrow="Pipeline engine"
        title="Lead intelligence"
        description="Find, qualify, and research the companies most likely to become customers."
        icon={Building2}
        actions={<>
          <button onClick={() => setIsCsvModalOpen(true)} className="btn btn-secondary btn-sm">
            <FileSpreadsheet size={14} /> Import CSV
          </button>
          <button onClick={loadLeads} className="btn btn-ghost btn-icon" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
        </>}
      />

      {/* Quick Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <Panel className="stat-card">
          <div className="stat-label">Total Leads</div>
          <div className="stat-value">{totalCount}</div>
        </Panel>
        <Panel className="stat-card">
          <div className="stat-label">Qualified</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{qualifiedCount}</div>
        </Panel>
        <Panel className="stat-card">
          <div className="stat-label">Pending Review</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{reviewCount}</div>
        </Panel>
        <Panel className="stat-card">
          <div className="stat-label">Dispatched</div>
          <div className="stat-value" style={{ color: 'var(--brand)' }}>{dispatchedCount}</div>
        </Panel>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="search-bar" style={{ flex: 1, maxWidth: 440 }}>
          <Search size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search company, contact, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadLeads()}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {['ALL', 'CANDIDATE', 'QUALIFIED', 'OUTREACH_READY', 'OUTREACH_SENT', 'RESPONDED', 'DISQUALIFIED'].map((s) => (
            <button
              key={s}
              className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Left List + Right Lead 360 */}
      <div className="pipeline-grid">
        {/* Left Column: Lead Cards */}
        <div className="leads-list-column">
          {!loading && leads.length > 0 && (
            <div className="lead-list-heading">
              <div>
                <h2>Leads</h2>
                <span>Choose a company to open its dossier</span>
              </div>
              <span className="lead-list-count">{leads.length}</span>
            </div>
          )}
          {loading && leads.length === 0 ? (
            <div className="empty-state">
              <RefreshCw size={28} className="animate-spin text-blue-600 mb-2" />
              <p className="text-sm font-medium text-slate-700">Loading candidate leads...</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="empty-state">
              <Building2 size={36} className="text-slate-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No leads found</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                Import a CSV of companies or adjust your search filter to populate the pipeline.
              </p>
              <button onClick={() => setIsCsvModalOpen(true)} className="btn btn-primary text-xs">
                <FileSpreadsheet size={13} /> Import CSV
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
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectLead(lead.id);
                    }
                  }}
                >
                  {/* Identity row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                          {lead.companyName?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4
                            className="font-semibold text-slate-900 text-sm truncate"
                            title={lead.companyName}
                          >
                            {lead.companyName}
                          </h4>
                          <p
                            className="text-xs text-slate-600 font-medium truncate"
                            title={`${lead.fullName || 'Target Lead'}${lead.role ? ` · ${lead.role}` : ''}`}
                          >
                            {lead.fullName || 'Target Lead'}
                            {lead.role && <span className="text-slate-400 font-normal"> · {lead.role}</span>}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div
                        className={`score-badge border px-2 py-0.5 rounded-full font-bold text-xs whitespace-nowrap ${getScoreColor(lead.leadScore)}`}
                      >
                        {lead.leadScore !== null ? `${lead.leadScore}/100` : 'Unscored'}
                      </div>
                      {getStatusBadge(lead.status)}
                    </div>
                  </div>

                  {/* Attributes & Signals preview */}
                  <div className="card-attributes mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                      {lead.company?.country && (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <MapPin size={11} className="text-slate-400" /> {lead.company.country}
                        </span>
                      )}
                      {lead.company?.employeeCount && (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Users size={11} className="text-slate-400" /> {lead.company.employeeCount.toLocaleString()}
                        </span>
                      )}
                      {lead.industry && <span className="truncate text-slate-600">{lead.industry}</span>}
                      {lead.company?.fundingStage && (
                        <span className="text-emerald-700 font-medium whitespace-nowrap bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 text-[10.5px]">
                          {lead.company.fundingStage}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={(e) => handleRunPipeline(lead.id, e)}
                      disabled={isProcessing}
                      className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center gap-1 shrink-0 whitespace-nowrap disabled:opacity-60 transition-colors"
                      title="Enrich, detect signals, qualify, score, research and draft outreach"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw size={11} className="animate-spin" /> Processing...
                        </>
                      ) : (
                        <>
                          <Cpu size={11} /> Run Pipeline
                        </>
                      )}
                    </button>
                  </div>

                  {/* Signal pills */}
                  {lead.company?.signals && lead.company.signals.length > 0 && (
                    <div className="signal-mini-tags mt-2.5 flex flex-wrap gap-1.5">
                      {lead.company.signals.slice(0, 2).map((sig) => (
                        <span key={sig.id} className="signal-pill flex items-center gap-1">
                          <Zap size={10} className="text-amber-600 shrink-0" />
                          <span>{sig.headline.slice(0, 36)}...</span>
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
              <RefreshCw size={32} className="animate-spin text-blue-600 mb-2" />
              <p className="text-sm font-medium text-slate-700">Synthesizing Lead 360 Intelligence...</p>
            </div>
          ) : !lead360 ? (
            <div className="empty-state">
              <Cpu size={40} className="text-slate-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-800">Select a lead to inspect 360° dossier</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                View deterministic qualification rules, multi-factor score breakdown, verified evidence, and AI outreach drafts.
              </p>
            </div>
          ) : (
            <div className="lead-360-container space-y-4">
              {/* Profile Header Card */}
              <Panel className="dossier-card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        {lead360.lead.companyName}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                        {lead360.lead.industry || 'B2B SaaS'}
                      </span>
                    </div>
                    <p className="text-slate-700 font-medium text-sm mt-1">
                      {lead360.lead.fullName} — <span className="text-blue-600 font-semibold">{lead360.lead.role}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3.5 text-xs text-slate-500 mt-2.5">
                      {lead360.lead.country && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-slate-400" /> {lead360.lead.country}
                        </span>
                      )}
                      {lead360.lead.employeeCount && (
                        <span className="flex items-center gap-1">
                          <Users size={12} className="text-slate-400" /> {lead360.lead.employeeCount} Employees
                        </span>
                      )}
                      {lead360.lead.fundingStage && (
                        <span className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <DollarSign size={11} /> {lead360.lead.fundingStage}
                        </span>
                      )}
                      {lead360.lead.website && (
                        <a
                          href={lead360.lead.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                        >
                          <Globe size={11} /> {lead360.lead.website.replace('https://', '')}
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`score-badge-large ${getScoreColor(lead360.score.totalScore)}`}>
                      <span className="text-2xl font-black">{lead360.score.totalScore ?? '—'}</span>
                      <span className="text-xs font-semibold opacity-80">/ 100</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 font-mono">
                      v{lead360.score.formulaVersion}
                    </div>
                  </div>
                </div>
              </Panel>

              <AgentRunTrace
                events={lead360.agentTrace.events}
                runs={lead360.agentTrace.runs}
                qualification={lead360.agentTrace.qualification}
                enrichment={lead360.agentTrace.enrichment}
                signals={lead360.signals}
                research={lead360.research}
                score={lead360.score}
                outreach={lead360.outreach}
              />

              {/* Explainable Scoring Breakdown */}
              <div className="dossier-card">
                <div className="lead-intel-panel-heading">
                  <div className="lead-intel-panel-title">
                    <span className="lead-intel-panel-icon success"><ShieldCheck size={16} /></span>
                    <div>
                      <h3>Deterministic & Multi-Factor Scoring Breakdown</h3>
                      <p>See how qualification signals contribute to the account score.</p>
                    </div>
                  </div>
                  {lead360.score.explanation?.length ? <span className="lead-intel-count">{lead360.score.explanation.length} factors</span> : <span className="lead-intel-state">Not scored</span>}
                </div>
                <div className="lead-intel-factor-grid">
                  {lead360.score.explanation?.length ? (
                    lead360.score.explanation.map((item, idx) => (
                      <div key={idx} className="lead-intel-factor">
                        <div className="lead-intel-factor-head">
                          <span>{item.factor}</span>
                          <span className="lead-intel-points">
                            +{item.points} / {item.max} pts
                          </span>
                        </div>
                        <p>{item.reason}</p>
                      </div>
                    ))
                  ) : (
                    <div className="lead-intel-empty">
                      <span className="lead-intel-empty-icon"><ShieldCheck size={16} /></span>
                      <div><strong>Scoring details aren’t available yet</strong><p>Run the pipeline for this lead to calculate and explain its score.</p></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Verified Business Signals */}
              <div className="dossier-card">
                <div className="lead-intel-panel-heading">
                  <div className="lead-intel-panel-title">
                    <span className="lead-intel-panel-icon warning"><TrendingUp size={16} /></span>
                    <div><h3>Verified Market Signals</h3><p>Evidence-backed events found for this company.</p></div>
                  </div>
                  <span className="lead-intel-count">{lead360.signals.length} {lead360.signals.length === 1 ? 'signal' : 'signals'}</span>
                </div>
                <div className="signals-grid lead-intel-signals">
                  {lead360.signals.length === 0 ? (
                    <div className="lead-intel-empty">
                      <span className="lead-intel-empty-icon warning"><Zap size={16} /></span>
                      <div><strong>No verified signals found</strong><p>Company signals will appear here after the next pipeline run.</p></div>
                      <span className="lead-intel-state">Awaiting research</span>
                    </div>
                  ) : (
                    lead360.signals.map((sig) => (
                      <div key={sig.id} className="signal-card">
                        <div className="flex items-center justify-between text-xs">
                          <span className="signal-type-tag">{sig.type.replace('_', ' ')}</span>
                          <span className="text-[11px] text-slate-500">
                            Confidence: <strong className="text-emerald-700">{Math.round(sig.confidence * 100)}%</strong>
                          </span>
                        </div>
                        <h4 className="font-semibold text-xs text-slate-800 mt-1.5">{sig.headline}</h4>
                        {sig.detail && <p className="text-xs text-slate-600 mt-1">{sig.detail}</p>}
                        <div className="source-footnote mt-2 text-[11px] text-slate-400">
                          Source: <span className="font-medium text-slate-600">{sig.source}</span>
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
                    <Cpu size={16} className="text-blue-600" />
                    AI Research Agent Dossier (Confidence: {Math.round(lead360.research.confidenceScore * 100)}%)
                  </h3>
                  <p className="text-xs text-slate-700 mt-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
                    {lead360.research.summary}
                  </p>

                  {/* Pain points */}
                  <div className="mt-3.5">
                    <h5 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Identified Operational Pain Points:
                    </h5>
                    <div className="space-y-1.5 mt-2">
                      {lead360.research.painPoints?.map((pp: any, i: number) => (
                        <div key={i} className="text-xs p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80 text-slate-700">
                          <strong className="text-amber-800 font-semibold">{pp.area || `Point ${i + 1}`}:</strong>{' '}
                          {pp.description || pp}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Generated Outreach & Human Review CTA */}
              <div className="dossier-card">
                <div className="lead-intel-panel-heading">
                  <div className="lead-intel-panel-title">
                    <span className="lead-intel-panel-icon"><Send size={16} /></span>
                    <div><h3>Signal-Grounded Outreach Draft</h3><p>Personalized copy grounded in the lead’s available evidence.</p></div>
                  </div>
                  {onOpenOutreachReview && (
                    <button
                      onClick={onOpenOutreachReview}
                      className="lead-intel-review-link"
                    >
                      Human Review Center <ArrowRight size={13} />
                    </button>
                  )}
                </div>

                {lead360.outreach.length === 0 ? (
                  <div className="lead-intel-empty outreach-empty">
                    <span className="lead-intel-empty-icon"><Send size={16} /></span>
                    <div><strong>No outreach draft yet</strong><p>Run the pipeline to create evidence-based copy for this lead.</p></div>
                    <button
                      type="button"
                      className="btn btn-secondary lead-intel-run-button"
                      onClick={(event) => selectedLeadId && handleRunPipeline(selectedLeadId, event)}
                      disabled={!selectedLeadId || processingId === selectedLeadId}
                    >
                      {processingId === selectedLeadId ? <RefreshCw size={13} className="animate-spin" /> : <Cpu size={13} />}
                      {processingId === selectedLeadId ? 'Running…' : 'Run pipeline'}
                    </button>
                  </div>
                ) : (
                  <div className="outreach-preview-box mt-3">
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200">
                      <span className="font-semibold text-slate-800">
                        Subject: {lead360.outreach[0].subject || 'Scaling Finance Operations'}
                      </span>
                      <span className="badge badge-warning">{lead360.outreach[0].state}</span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-line mt-2.5 font-mono leading-relaxed bg-slate-50 p-3 rounded border border-slate-200">
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
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div>
                <p className="modal-title">Import Leads from CSV</p>
                <p className="modal-desc">
                  Columns: Company Name, Domain, Industry, Employees, Country, Role, Contact Name, Email
                </p>
              </div>
            </div>
            <div className="modal-body">
              <textarea
                className="form-textarea"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                rows={7}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`Company Name,Domain,Industry,Employees,Country,Role,Contact Name,Email\nAcme Cloud,acmecloud.io,B2B SaaS,180,US,CFO,John Doe,john@acmecloud.io`}
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setIsCsvModalOpen(false)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button onClick={handleImportCsv} className="btn btn-primary btn-sm" disabled={!csvText.trim()}>
                <FileSpreadsheet size={13} /> Import & Process
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
