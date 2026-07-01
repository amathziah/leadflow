import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import type { Workflow, ExecutionLog } from '../services/api';
import { Cpu, Terminal, AlertTriangle, Calendar, Image, RefreshCw, X } from 'lucide-react';

const WorkflowsPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const logsIntervalRef = useRef<any>(null);

  // Fetch all workflows at mount
  const fetchWorkflows = async (selectFirst = true) => {
    try {
      const response = await api.getWorkflows();
      const list = response.data || [];
      setWorkflows(list);
      
      if (selectFirst && list.length > 0 && !selectedWorkflowId) {
        setSelectedWorkflowId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load workflows list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
    return () => stopLogsInterval();
  }, []);

  // Handle selected workflow change
  useEffect(() => {
    if (!selectedWorkflowId) return;

    stopLogsInterval();
    fetchWorkflowDetailsAndLogs(selectedWorkflowId);

    // If the workflow is running, poll for log updates
    const current = workflows.find((w) => w.id === selectedWorkflowId);
    if (current && (current.status === 'RUNNING' || current.status === 'PENDING')) {
      startLogsInterval(selectedWorkflowId);
    }
  }, [selectedWorkflowId, workflows]);

  const startLogsInterval = (id: string) => {
    stopLogsInterval();
    logsIntervalRef.current = setInterval(() => {
      fetchWorkflowDetailsAndLogs(id, false);
      // Also fetch workflows list in the background to update status changes
      fetchWorkflows(false);
    }, 2500);
  };

  const stopLogsInterval = () => {
    if (logsIntervalRef.current) {
      clearInterval(logsIntervalRef.current);
      logsIntervalRef.current = null;
    }
  };

  const fetchWorkflowDetailsAndLogs = async (id: string, showSpinner = true) => {
    if (showSpinner) setLogsLoading(true);
    try {
      const [wfResult, logsResult] = await Promise.all([
        api.getWorkflowById(id),
        api.getWorkflowLogs(id),
      ]);
      setSelectedWorkflow(wfResult.data);
      setLogs(logsResult.data || []);
      
      // Auto-scroll terminal to bottom
      setTimeout(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('Failed to load workflow telemetry details:', err);
    } finally {
      if (showSpinner) setLogsLoading(false);
    }
  };

  const renderSummaryWithCitations = (summaryText: string, leads: any[]) => {
    const citationRegex = /\[(\d+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(summaryText)) !== null) {
      const matchIndex = match.index;
      const citationNumber = parseInt(match[1], 10);

      // Append text before the citation
      if (matchIndex > lastIndex) {
        parts.push(summaryText.substring(lastIndex, matchIndex));
      }

      // Check if this citation maps to a lead we have
      const lead = leads[citationNumber - 1];
      if (lead && lead.website) {
        parts.push(
          <a
            key={`cite-${matchIndex}`}
            href={lead.website}
            target="_blank"
            rel="noreferrer"
            title={lead.companyName}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.2)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              color: '#a78bfa',
              fontSize: '11px',
              fontWeight: 700,
              marginLeft: '4px',
              marginRight: '2px',
              textDecoration: 'none',
              verticalAlign: 'super',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-violet)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
              e.currentTarget.style.color = '#a78bfa';
            }}
          >
            {citationNumber}
          </a>
        );
      } else {
        parts.push(`[${citationNumber}]`);
      }

      lastIndex = citationRegex.lastIndex;
    }

    if (lastIndex < summaryText.length) {
      parts.push(summaryText.substring(lastIndex));
    }

    return parts.length > 0 ? parts : summaryText;
  };

  return (
    <div style={{ display: 'flex', flexGrow: 1, gap: '28px', position: 'relative', zIndex: 1, height: 'calc(100vh - 120px)' }}>
      
      {/* 1. Left Side: Active/Past Runs List */}
      <div className="panel-card" style={{ width: '320px', height: '100%', padding: '20px', flexShrink: 0 }}>
        <div className="panel-header" style={{ marginBottom: '16px', paddingBottom: '12px' }}>
          <h3 className="panel-title">
            <Cpu size={18} style={{ color: 'var(--accent-violet)' }} />
            Scavenger Runs
          </h3>
          <button 
            onClick={() => fetchWorkflows(false)} 
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flexGrow: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading crawlers...
            </div>
          ) : workflows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No crawler runs found.
            </div>
          ) : (
            workflows.map((wf) => {
              const isSelected = wf.id === selectedWorkflowId;
              const isRunning = wf.status === 'RUNNING';
              const isComp = wf.status === 'COMPLETED';
              const isFail = wf.status === 'FAILED';

              return (
                <div
                  key={wf.id}
                  onClick={() => setSelectedWorkflowId(wf.id)}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--accent-violet)' : 'var(--border-color)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255,255,255,0.01)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span
                      className="workflow-status-badge"
                      style={{
                        background: isComp 
                          ? 'rgba(16, 185, 129, 0.12)' 
                          : isRunning 
                          ? 'rgba(245, 158, 11, 0.12)' 
                          : isFail 
                          ? 'rgba(239, 68, 68, 0.12)' 
                          : 'rgba(255,255,255,0.05)',
                        color: isComp ? '#34d399' : isRunning ? '#fbbf24' : isFail ? '#fca5a5' : '#94a3b8'
                      }}
                    >
                      {wf.status}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Calendar size={10} />
                      {new Date(wf.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <h4 style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    "{wf.query}"
                  </h4>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Right Side: Telemetry Terminal Console */}
      <div className="panel-card" style={{ flexGrow: 1, height: '100%', padding: '24px' }}>
        {selectedWorkflow ? (
          <>
            {/* Header info */}
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Query: "{selectedWorkflow.query}"
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    ID: <code style={{ fontSize: '11px', padding: '2px 4px' }}>{selectedWorkflow.id}</code> • Initiated: {new Date(selectedWorkflow.createdAt).toLocaleString()}
                  </p>
                </div>
                {selectedWorkflow.status === 'RUNNING' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '13px', fontWeight: 600 }}>
                    <RefreshCw size={14} style={{ animation: 'spin 2s linear infinite' }} />
                    Streaming Logs
                  </span>
                )}
              </div>

              {selectedWorkflow.error && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  background: 'var(--accent-rose-glow)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={16} />
                  <span><strong>Crawler Error:</strong> {selectedWorkflow.error}</span>
                </div>
              )}
            </div>

            {/* AI Synthesized Research Summary (Perplexity style) */}
            {selectedWorkflow.summary && (
              <div className="research-summary-card" style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                  <div style={{
                    background: 'rgba(139, 92, 246, 0.15)',
                    color: 'var(--accent-violet)',
                    padding: '6px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Cpu size={18} />
                  </div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    AI Synthesized Research Summary
                  </h4>
                </div>

                <div style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  paddingRight: '6px',
                }}>
                  {renderSummaryWithCitations(selectedWorkflow.summary, selectedWorkflow.leads || [])}
                </div>

                {/* Sources List */}
                {selectedWorkflow.leads && selectedWorkflow.leads.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Cited Sources
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedWorkflow.leads.map((lead, idx) => (
                        <a
                          key={lead.id}
                          href={lead.website || '#'}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            textDecoration: 'none',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-violet)';
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                          }}
                        >
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: 'rgba(139, 92, 246, 0.2)',
                            color: 'var(--accent-violet)',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: 500 }}>{lead.companyName}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Terminal console */}
            <div className="terminal-container">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', marginBottom: '12px', color: 'var(--text-muted)' }}>
                <Terminal size={14} />
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scavenger Execution Terminal</span>
              </div>

              {logsLoading && logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading logs...
                </div>
              ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No execution logs streamed yet.
                </div>
              ) : (
                logs.map((log) => {
                  const logType = log.level.toLowerCase() as 'info' | 'warn' | 'error';
                  const screenshotUrl = log.metadata?.screenshotUrl;

                  return (
                    <div key={log.id} className={`terminal-log ${logType}`}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px' }}>
                        <span className="log-time">
                          [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]
                        </span>
                        <span className="log-step">{log.step}</span>
                        <span className="log-message">{log.message}</span>
                      </div>
                      
                      {/* Embedded screenshot if found in log metadata */}
                      {screenshotUrl && (
                        <div>
                          <button 
                            className="log-screenshot-btn"
                            onClick={() => setModalImageUrl(screenshotUrl)}
                          >
                            <Image size={12} />
                            <span>View Browser Telemetry</span>
                          </button>
                          <div>
                            <img
                              src={screenshotUrl}
                              alt={`Screenshot step ${log.step}`}
                              className="screenshot-embed"
                              onClick={() => setModalImageUrl(screenshotUrl)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Cpu className="empty-state-icon" />
            <p className="empty-state-text">Select an active or historical scavenger run from the sidebar panel to view live logs and telemetry screenshots.</p>
          </div>
        )}
      </div>

      {/* Full-screen Telemetry Photo Modal */}
      {modalImageUrl && (
        <div className="media-modal-overlay open" onClick={() => setModalImageUrl(null)}>
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="media-modal-close" onClick={() => setModalImageUrl(null)}>
              <X size={18} />
            </button>
            <img src={modalImageUrl} alt="Browser Telemetry Screenshot" className="media-modal-img" />
          </div>
        </div>
      )}
      
      {/* CSS Keyframes injected dynamically */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default WorkflowsPage;
