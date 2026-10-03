import React, { useState, useEffect } from 'react';
import { api, type Competitor, type Analysis } from '../services/api';
import {
  Building2,
  Search,
  ExternalLink,
  FileText,
  TrendingUp,
  Code2,
  Shield,
  Zap,
  Target,
  ChevronDown,
  ChevronUp,
  Trash2,
  Clock,
} from 'lucide-react';

interface CompetitorProfilesPageProps {
  onViewTrajectory: (id: string) => void;
}

const CompetitorProfilesPage: React.FC<CompetitorProfilesPageProps> = ({ onViewTrajectory }) => {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'features' | 'dossier'>('overview');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Load all analyses
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.getAnalyses();
        const list = res.data || [];
        setAnalyses(list);
        if (list.length > 0 && !selectedAnalysisId) {
          setSelectedAnalysisId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load analyses:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load competitors when analysis selected
  useEffect(() => {
    if (!selectedAnalysisId) return;
    const load = async () => {
      try {
        const res = await api.getAnalysisById(selectedAnalysisId);
        setSelectedAnalysis(res.data);
        const comps = (res.data.leads as Competitor[]) || [];
        setCompetitors(comps);
        if (comps.length > 0) setSelectedCompetitor(comps[0]);
      } catch (err) {
        console.error('Failed to load analysis details:', err);
      }
    };
    load();
  }, [selectedAnalysisId]);

  const filtered = competitors.filter(c =>
    c.companyName.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteAnalysis = async () => {
    if (!selectedAnalysisId || deleting) return;
    if (!confirm('Delete this analysis and all its competitor data?')) return;
    setDeleting(true);
    try {
      await api.deleteAnalysis(selectedAnalysisId);
      const remaining = analyses.filter(a => a.id !== selectedAnalysisId);
      setAnalyses(remaining);
      setSelectedAnalysisId(remaining[0]?.id || null);
      setCompetitors([]);
      setSelectedCompetitor(null);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeleting(false);
    }
  };

  const scoreClass = (score: number | null) => {
    if (!score) return 'score-low';
    if (score >= 70) return 'score-high';
    if (score >= 40) return 'score-med';
    return 'score-low';
  };

  const parseQuery = (query: string) => {
    const parts = query.split(' vs ');
    return { company: parts[0] || query, competitors: parts.slice(1).join(' vs ') };
  };

  const renderDossier = (text: string) => {
    const lines = text.split('\n');
    let html = '';
    for (const line of lines) {
      if (line.startsWith('# ')) html += `<h1>${line.slice(2)}</h1>`;
      else if (line.startsWith('## ')) html += `<h2>${line.slice(3)}</h2>`;
      else if (line.startsWith('### ')) html += `<h3>${line.slice(4)}</h3>`;
      else if (line.startsWith('- ')) html += `<ul><li>${line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li></ul>`;
      else if (line.startsWith('| ')) {
        const cells = line.split('|').filter(Boolean).map(c => c.trim());
        if (!line.includes('---') && cells.length > 0) {
          html += `<table><tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr></table>`;
        }
      }
      else if (line.trim() === '') html += '<br/>';
      else html += `<p>${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code>$1</code>')}</p>`;
    }
    return html;
  };

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '16px' }} />)}
        </div>
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="page-container">
        <div className="empty-state" style={{ height: '60vh' }}>
          <div className="empty-icon"><Building2 size={28} color="var(--accent-violet)" /></div>
          <div className="empty-title">No reports yet</div>
          <div className="empty-desc">Run a competitor analysis to generate intelligence reports and competitor profiles.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <Building2 size={18} color="var(--accent-violet)" />
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Competitor Reports</span>
        <div style={{ flex: 1 }} />

        <select
          id="report-analysis-selector"
          className="form-select"
          style={{ width: '300px' }}
          value={selectedAnalysisId || ''}
          onChange={e => { setSelectedAnalysisId(e.target.value); setSelectedCompetitor(null); }}
        >
          {analyses.map(a => {
            const { company } = parseQuery(a.query);
            return (
              <option key={a.id} value={a.id}>
                {company} — {a.status} ({new Date(a.createdAt).toLocaleDateString()})
              </option>
            );
          })}
        </select>

        {selectedAnalysis?.status === 'RUNNING' || selectedAnalysis?.status === 'PENDING' ? (
          <button className="btn btn-secondary btn-sm" onClick={() => onViewTrajectory(selectedAnalysisId!)}>
            <TrendingUp size={13} /> Live View
          </button>
        ) : null}

        <button className="btn btn-danger btn-sm" onClick={handleDeleteAnalysis} disabled={deleting}>
          <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden' }}>
        {/* Left: competitors list */}
        <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
          <div style={{ padding: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="competitor-search"
                className="form-input"
                style={{ paddingLeft: '34px', fontSize: '13px' }}
                placeholder="Search competitors..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Dossier tab (full report) */}
          <div style={{ padding: '0 12px 8px' }}>
            <button
              id="tab-full-dossier"
              className={`btn btn-sm w-full ${activeTab === 'dossier' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', gap: '8px' }}
              onClick={() => { setActiveTab('dossier'); setSelectedCompetitor(null); }}
            >
              <FileText size={14} /> Full Intelligence Dossier
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 16px' }}>
                <div className="empty-desc">No competitor profiles found</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtered.map(c => (
                  <div
                    key={c.id}
                    id={`competitor-card-${c.id}`}
                    className={`competitor-card ${selectedCompetitor?.id === c.id && activeTab !== 'dossier' ? 'selected' : ''}`}
                    onClick={() => { setSelectedCompetitor(c); setActiveTab('overview'); }}
                    style={{ padding: '14px' }}
                  >
                    <div className="competitor-card-header" style={{ marginBottom: '8px' }}>
                      <div className="competitor-avatar" style={{ width: '36px', height: '36px', fontSize: '14px' }}>
                        {c.companyName[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="competitor-name truncate">{c.companyName}</div>
                        <div className="competitor-industry">{c.industry || 'Technology'}</div>
                      </div>
                      <div className={`score-ring ${scoreClass(c.leadScore)}`} style={{ width: '36px', height: '36px', fontSize: '11px' }}>
                        {c.leadScore || '?'}
                      </div>
                    </div>
                    {c.competitiveMoats && (
                      <div className="competitor-positioning" style={{ fontSize: '11.5px', marginBottom: '0' }}>
                        {c.competitiveMoats.slice(0, 100)}...
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail pane */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeTab === 'dossier' ? (
            // Full dossier view
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="pane-header">
                <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                  Executive Intelligence Dossier
                </span>
                {selectedAnalysis?.confidenceScore && (
                  <span style={{ fontSize: '12px', color: 'var(--accent-emerald)', fontWeight: '700' }}>
                    {selectedAnalysis.confidenceScore}% confidence
                  </span>
                )}
              </div>
              <div className="pane-body">
                {selectedAnalysis?.executiveDossier ? (
                  <div className="dossier-content" dangerouslySetInnerHTML={{ __html: renderDossier(selectedAnalysis.executiveDossier) }} />
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><FileText size={28} color="var(--accent-violet)" /></div>
                    <div className="empty-title">
                      {selectedAnalysis?.status === 'RUNNING' ? 'Generating dossier...' : 'No dossier'}
                    </div>
                    <div className="empty-desc">
                      {selectedAnalysis?.status === 'RUNNING'
                        ? 'The dossier will appear after the agent completes synthesis.'
                        : 'Complete the analysis to generate the dossier.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : selectedCompetitor ? (
            // Competitor detail view
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Competitor header */}
              <div className="pane-header" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(6,182,212,0.03) 100%)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div className="competitor-avatar">{selectedCompetitor.companyName[0]?.toUpperCase()}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {selectedCompetitor.companyName}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectedCompetitor.industry}
                      {selectedCompetitor.website && (
                        <a href={selectedCompetitor.website} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--accent-violet-light)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <ExternalLink size={11} /> Website
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className={`score-ring ${scoreClass(selectedCompetitor.leadScore)}`}>
                    {selectedCompetitor.leadScore || '?'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Relevance</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Score</span>
                  </div>
                </div>
              </div>

              {/* Tab bar */}
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                <div className="tab-bar">
                  {[
                    { id: 'overview', label: 'Overview', icon: Target },
                    { id: 'pricing', label: 'Pricing', icon: TrendingUp },
                    { id: 'features', label: 'Features', icon: Zap },
                  ].map(({ id, label, icon: Icon }) => (
                    <button key={id} id={`detail-tab-${id}`} className={`tab-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id as any)}>
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pane-body">
                {activeTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Positioning */}
                    {selectedCompetitor.competitiveMoats && (
                      <div className="card">
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-violet)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Positioning</div>
                        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{selectedCompetitor.competitiveMoats}</p>
                      </div>
                    )}

                    {/* Target Customer */}
                    {selectedCompetitor.metadata?.targetCustomer && (
                      <div className="card">
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Target Customer</div>
                        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>{selectedCompetitor.metadata.targetCustomer}</p>
                      </div>
                    )}

                    {/* Strengths / Weaknesses */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {selectedCompetitor.metadata?.strengths && selectedCompetitor.metadata.strengths.length > 0 && (
                        <div className="card">
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                            <Shield size={12} style={{ display: 'inline', marginRight: '4px' }} /> Strengths
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {selectedCompetitor.metadata.strengths.map((s, i) => (
                              <div key={i} className="tag tag-strength" style={{ display: 'block', borderRadius: '6px' }}>{s}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedCompetitor.metadata?.weaknesses && selectedCompetitor.metadata.weaknesses.length > 0 && (
                        <div className="card">
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-rose)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                            ⚠️ Weaknesses
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {selectedCompetitor.metadata.weaknesses.map((w, i) => (
                              <div key={i} className="tag tag-weakness" style={{ display: 'block', borderRadius: '6px' }}>{w}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tech stack */}
                    {selectedCompetitor.metadata?.techStack && selectedCompetitor.metadata.techStack.length > 0 && (
                      <div className="card">
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                          <Code2 size={12} style={{ display: 'inline', marginRight: '4px' }} /> Tech Stack
                        </div>
                        <div className="tag-list">
                          {selectedCompetitor.metadata.techStack.map((t, i) => (
                            <span key={i} className="tag tag-tech">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Executives */}
                    {selectedCompetitor.metadata?.keyExecutives && selectedCompetitor.metadata.keyExecutives.length > 0 && (
                      <div className="card">
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Key People</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {selectedCompetitor.metadata.keyExecutives.map((exec, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', color: 'var(--accent-violet-light)' }}>
                                {exec.name?.[0]?.toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{exec.name}</div>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{exec.role}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'pricing' && (
                  <div>
                    {selectedCompetitor.metadata?.pricingTiers && selectedCompetitor.metadata.pricingTiers.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                        {selectedCompetitor.metadata.pricingTiers.map((tier, i) => (
                          <div key={i} className="pricing-tier">
                            <div className="pricing-tier-name">{tier.name}</div>
                            <div className="pricing-tier-price">{tier.price}</div>
                            {tier.features?.length > 0 && (
                              <ul style={{ paddingLeft: '16px', marginTop: '8px' }}>
                                {tier.features.slice(0, 6).map((f, j) => (
                                  <li key={j} style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{f}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <div className="empty-icon"><TrendingUp size={24} color="var(--accent-violet)" /></div>
                        <div className="empty-title">No pricing data</div>
                        <div className="empty-desc">Pricing information was not found during the crawl for this competitor.</div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'features' && (
                  <div>
                    {selectedCompetitor.metadata?.keyFeatures && selectedCompetitor.metadata.keyFeatures.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedCompetitor.metadata.keyFeatures.map((feat, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-violet)', flexShrink: 0 }} />
                            <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>{feat}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <div className="empty-icon"><Zap size={24} color="var(--accent-violet)" /></div>
                        <div className="empty-title">No features data</div>
                        <div className="empty-desc">Feature information was not extracted for this competitor.</div>
                      </div>
                    )}

                    {/* Recent Updates */}
                    {selectedCompetitor.metadata?.recentUpdates && selectedCompetitor.metadata.recentUpdates.length > 0 && (
                      <div style={{ marginTop: '24px' }}>
                        <p className="section-title">Recent Updates</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {selectedCompetitor.metadata.recentUpdates.map((update, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                              <Clock size={13} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
                              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{update}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ height: '100%' }}>
              <div className="empty-icon"><Building2 size={28} color="var(--accent-violet)" /></div>
              <div className="empty-title">Select a competitor</div>
              <div className="empty-desc">Choose a competitor from the list to view their detailed intelligence profile.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompetitorProfilesPage;
