import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Search,
  Globe,
  FileText,
  ShieldCheck,
  Sparkles,
  Terminal,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { api, type Analysis, type ExecutionLog } from '../services/api';

interface LiveTrajectoryViewerProps {
  preselectedId?: string | null;
}

const TOOL_META: Record<string, { icon: any; color: string; bg: string }> = {
  planner:          { icon: Brain,       color: 'var(--accent-violet)',  bg: 'rgba(139,92,246,0.15)' },
  search_web:       { icon: Search,      color: 'var(--accent-cyan)',    bg: 'rgba(6,182,212,0.15)'   },
  navigate_som:     { icon: Globe,       color: 'var(--accent-amber)',   bg: 'rgba(245,158,11,0.15)'  },
  explore_subpage:  { icon: Eye,         color: 'var(--accent-amber)',   bg: 'rgba(245,158,11,0.12)'  },
  extract_entities: { icon: Sparkles,    color: 'var(--accent-violet)',  bg: 'rgba(139,92,246,0.12)'  },
  synthesize_dossier:{ icon: FileText,   color: 'var(--accent-emerald)', bg: 'rgba(16,185,129,0.15)'  },
  fact_check:       { icon: ShieldCheck, color: 'var(--accent-emerald)', bg: 'rgba(16,185,129,0.12)'  },
  agent_error:      { icon: XCircle,     color: 'var(--accent-rose)',    bg: 'rgba(244,63,94,0.15)'   },
  default:          { icon: Terminal,    color: 'var(--text-muted)',     bg: 'rgba(255,255,255,0.06)' },
};

const getToolMeta = (toolName?: string) =>
  (toolName && TOOL_META[toolName]) || TOOL_META.default;

const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const parseQuery = (query: string) => {
  const parts = query.split(' vs ');
  return { company: parts[0] || query, competitors: parts.slice(1).join(' vs ') };
};

const LiveTrajectoryViewer: React.FC<LiveTrajectoryViewerProps> = ({ preselectedId }) => {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId || null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [activeView, setActiveView] = useState<'trajectory' | 'dossier' | 'sources'>('trajectory');
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Load analyses list
  const fetchAnalyses = async () => {
    try {
      const res = await api.getAnalyses();
      if (res.data.length > 0) {
        setAnalyses(res.data);
        if (!selectedId) setSelectedId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch analyses:', err);
    }
  };

  useEffect(() => {
    fetchAnalyses();
    const interval = setInterval(fetchAnalyses, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (preselectedId) setSelectedId(preselectedId);
  }, [preselectedId]);

  // Fetch full details
  const fetchDetails = async (id: string) => {
    try {
      const res = await api.getAnalysisById(id);
      if (res.success) {
        setSelectedAnalysis(res.data);
        if (res.data.logs) setLogs(res.data.logs as any);
      }
    } catch (err) {
      console.error('Failed to load analysis details:', err);
    }
  };

  // SSE stream + polling on selectedId change
  useEffect(() => {
    if (!selectedId) return;
    fetchDetails(selectedId);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = new EventSource(`http://localhost:4000/api/analyses/${selectedId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'LOGS' && payload.logs?.length > 0) {
          setLogs(prev => {
            const existingIds = new Set(prev.map((l: any) => l.id));
            const newLogs = payload.logs.filter((l: any) => !existingIds.has(l.id));
            return [...prev, ...newLogs];
          });
        }
        if (payload.type === 'STATUS') {
          setSelectedAnalysis(prev =>
            prev ? {
              ...prev,
              status: payload.status,
              confidenceScore: payload.confidenceScore ?? prev.confidenceScore,
              summary: payload.summary ?? prev.summary,
              executiveDossier: payload.executiveDossier ?? prev.executiveDossier,
              stats: payload.stats ?? prev.stats,
            } : prev
          );
          if (payload.status === 'COMPLETED' || payload.status === 'FAILED') {
            es.close();
            fetchAnalyses();
          }
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };

    return () => { es.close(); };
  }, [selectedId]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { PENDING: 'badge-pending', RUNNING: 'badge-running', COMPLETED: 'badge-completed', FAILED: 'badge-failed' };
    const icons: Record<string, any> = {
      PENDING: Clock, RUNNING: RefreshCw, COMPLETED: CheckCircle2, FAILED: XCircle,
    };
    const Icon = icons[status] || Clock;
    return <span className={`badge ${map[status] || 'badge-pending'}`}><Icon size={10} />{status}</span>;
  };

  const renderDossier = (text: string) => {
    // Simple markdown → HTML renderer
    const lines = text.split('\n');
    let html = '';
    for (const line of lines) {
      if (line.startsWith('# ')) html += `<h1>${line.slice(2)}</h1>`;
      else if (line.startsWith('## ')) html += `<h2>${line.slice(3)}</h2>`;
      else if (line.startsWith('### ')) html += `<h3>${line.slice(4)}</h3>`;
      else if (line.startsWith('- ')) html += `<ul><li>${line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li></ul>`;
      else if (line.startsWith('| ')) {
        // table row
        const cells = line.split('|').filter(Boolean).map(c => c.trim());
        if (line.includes('---')) html += ''; // separator
        else if (cells.length > 0) {
          const isHeader = lines.indexOf(line) < lines.findIndex(l => l.includes('---'));
          const tag = isHeader ? 'th' : 'td';
          html += `<table><tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr></table>`;
        }
      }
      else if (line.trim() === '') html += '<br/>';
      else html += `<p>${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code>$1</code>')}</p>`;
    }
    return html;
  };

  if (analyses.length === 0) {
    return (
      <div className="page-container">
        <div className="empty-state" style={{ height: '60vh' }}>
          <div className="empty-icon">
            <Terminal size={28} color="var(--accent-violet)" />
          </div>
          <div className="empty-title">No analyses running</div>
          <div className="empty-desc">Start a new competitive analysis to see the live agent trajectory here.</div>
        </div>
      </div>
    );
  }

  const competitorList = selectedAnalysis?.leads?.map(l => l.companyName).join(', ');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Terminal size={18} color="var(--accent-violet)" />
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Live Agent Trajectory</span>
          {selectedAnalysis && statusBadge(selectedAnalysis.status)}
        </div>

        {/* Analysis selector */}
        <select
          id="analysis-selector"
          className="form-select"
          style={{ width: '280px' }}
          value={selectedId || ''}
          onChange={e => { setSelectedId(e.target.value); setLogs([]); setSelectedAnalysis(null); }}
        >
          {analyses.map(a => {
            const { company } = parseQuery(a.query);
            return <option key={a.id} value={a.id}>{company} — {a.status} ({new Date(a.createdAt).toLocaleDateString()})</option>;
          })}
        </select>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px 1fr', overflow: 'hidden' }}>
        {/* Left: Analysis info + log list */}
        <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
          {/* Analysis summary card */}
          {selectedAnalysis && (
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {parseQuery(selectedAnalysis.query).company}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                vs {parseQuery(selectedAnalysis.query).competitors || 'Loading...'}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedAnalysis.confidenceScore && (
                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent-emerald)', fontWeight: '700' }}>
                    {selectedAnalysis.confidenceScore}% confidence
                  </span>
                )}
                {selectedAnalysis.stats?.pagesVisited && (
                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(6,182,212,0.1)', color: 'var(--accent-cyan)', fontWeight: '600' }}>
                    {selectedAnalysis.stats.pagesVisited} pages
                  </span>
                )}
                {selectedAnalysis.stats?.durationSeconds && (
                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: 'var(--accent-amber)', fontWeight: '600' }}>
                    {selectedAnalysis.stats.durationSeconds}s
                  </span>
                )}
              </div>
              {selectedAnalysis.summary && (
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: '1.5' }}>
                  {selectedAnalysis.summary.slice(0, 200)}...
                </p>
              )}
            </div>
          )}

          {/* Log count */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
            {logs.length} agent steps logged
            {selectedAnalysis?.status === 'RUNNING' && (
              <span style={{ marginLeft: '8px', color: 'var(--accent-cyan)' }}>● streaming...</span>
            )}
          </div>

          {/* Logs scroll area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            <div className="trajectory-feed">
              {logs.map(log => {
                const meta = getToolMeta(log.toolName);
                const Icon = meta.icon;
                return (
                  <div
                    key={log.id}
                    className="log-entry"
                    onClick={() => log.screenshotUrl && setSelectedScreenshot(log.screenshotUrl)}
                    style={{ cursor: log.screenshotUrl ? 'pointer' : 'default' }}
                  >
                    <div className="log-tool-icon" style={{ background: meta.bg, color: meta.color }}>
                      <Icon size={14} />
                    </div>
                    <div className="log-content">
                      <div className="log-message">{log.message}</div>
                      {log.thought && <div className="log-thought">{log.thought}</div>}
                      {log.screenshotUrl && (
                        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent-violet-light)' }}>
                          <Eye size={11} /> Visual telemetry captured
                        </div>
                      )}
                    </div>
                    <div className="log-time">{fmtTime(log.timestamp)}</div>
                  </div>
                );
              })}
              {(selectedAnalysis?.status === 'RUNNING' || selectedAnalysis?.status === 'PENDING') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', color: 'var(--accent-cyan)', fontSize: '12.5px', fontWeight: '500' }}>
                  <span className="spinner" />
                  Agent working...
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Right: Dossier / Sources */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="pane-header">
            <div className="tab-bar">
              <button id="tab-trajectory" className={`tab-btn ${activeView === 'trajectory' ? 'active' : ''}`} onClick={() => setActiveView('trajectory')}>
                <Terminal size={13} /> Plan
              </button>
              <button id="tab-dossier" className={`tab-btn ${activeView === 'dossier' ? 'active' : ''}`} onClick={() => setActiveView('dossier')}>
                <FileText size={13} /> Dossier
              </button>
              <button id="tab-sources" className={`tab-btn ${activeView === 'sources' ? 'active' : ''}`} onClick={() => setActiveView('sources')}>
                <Globe size={13} /> Sources
              </button>
            </div>

            {selectedScreenshot && (
              <button className="btn btn-secondary btn-sm" onClick={() => window.open(selectedScreenshot!, '_blank')}>
                <ExternalLink size={13} /> Screenshot
              </button>
            )}
          </div>

          <div className="pane-body">
            {/* Screenshot preview */}
            {selectedScreenshot && activeView === 'trajectory' && (
              <div style={{ marginBottom: '20px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <img src={selectedScreenshot} alt="SoM visual telemetry" style={{ width: '100%', display: 'block' }} />
              </div>
            )}

            {activeView === 'trajectory' && selectedAnalysis?.plan && (
              <div>
                <p className="section-title">Analysis Plan</p>
                <div className="card" style={{ marginBottom: '16px' }}>
                  {selectedAnalysis.plan.investigationSteps?.map((step: string, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: i < selectedAnalysis.plan.investigationSteps.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-violet)', background: 'rgba(139,92,246,0.1)', borderRadius: '4px', padding: '2px 7px', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{step}</span>
                    </div>
                  ))}
                </div>
                {competitorList && (
                  <div>
                    <p className="section-title">Competitors Profiled</p>
                    <div className="tag-list">
                      {selectedAnalysis.leads?.map(l => (
                        <span key={l.id} className="tag tag-tech">{l.companyName}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeView === 'trajectory' && !selectedAnalysis?.plan && (
              <div className="empty-state">
                <div className="empty-icon"><Brain size={28} color="var(--accent-violet)" /></div>
                <div className="empty-title">Waiting for plan...</div>
                <div className="empty-desc">The agent will formulate its investigation plan at the start of the analysis.</div>
              </div>
            )}

            {activeView === 'dossier' && (
              selectedAnalysis?.executiveDossier ? (
                <div
                  className="dossier-content"
                  dangerouslySetInnerHTML={{ __html: renderDossier(selectedAnalysis.executiveDossier) }}
                />
              ) : (
                <div className="empty-state">
                  <div className="empty-icon"><FileText size={28} color="var(--accent-violet)" /></div>
                  <div className="empty-title">
                    {selectedAnalysis?.status === 'RUNNING' || selectedAnalysis?.status === 'PENDING'
                      ? 'Dossier being synthesized...'
                      : 'No dossier available'}
                  </div>
                  <div className="empty-desc">
                    {selectedAnalysis?.status === 'RUNNING'
                      ? 'The executive dossier will appear here once synthesis is complete.'
                      : 'Complete an analysis to generate the intelligence dossier.'}
                  </div>
                </div>
              )
            )}

            {activeView === 'sources' && (
              <div>
                <p className="section-title" style={{ marginBottom: '14px' }}>Evidence Sources</p>
                {selectedAnalysis?.sources && selectedAnalysis.sources.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(selectedAnalysis.sources as any[]).map((src: any, i: number) => (
                      <div key={src.id || i} className="card" style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: '600', color: 'var(--text-primary)' }}>{src.domain}</span>
                          <a href={src.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-violet-light)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                            <ExternalLink size={11} /> Visit
                          </a>
                        </div>
                        {src.title && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{src.title}</div>}
                        {src.snippet && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>{src.snippet.slice(0, 200)}...</div>}
                        {src.reliabilityScore && (
                          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--accent-emerald)' }}>
                            Reliability: {Math.round(src.reliabilityScore * 100)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><Globe size={24} color="var(--accent-violet)" /></div>
                    <div className="empty-title">Sources pending</div>
                    <div className="empty-desc">Evidence sources are recorded as the agent navigates competitor sites.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTrajectoryViewer;
