import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Lead } from '../services/api';
import { Search, ExternalLink, Mail, Copy, Check, Trash2, X, Briefcase } from 'lucide-react';

const LinkedinIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className, style }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const LeadsPage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkedinCopied, setLinkedinCopied] = useState(false);

  // Load all leads on mount or filter change
  const loadLeads = async () => {
    setLoading(true);
    try {
      const response = await api.getLeads({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        industry: industryFilter || undefined,
        limit: 100, // retrieve bulk matches for frontend side filters
      });
      setLeads(response.data || []);
    } catch (err) {
      console.error('Failed to query leads database directory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [statusFilter, industryFilter]);

  // Handle search with simple key trigger or dynamic debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadLeads();
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Load selected lead profile details
  useEffect(() => {
    if (!selectedLeadId) {
      setSelectedLead(null);
      setDrawerOpen(false);
      return;
    }

    const fetchLeadDetails = async () => {
      try {
        const response = await api.getLeadById(selectedLeadId);
        setSelectedLead(response.data);
        setDrawerOpen(true);
      } catch (err) {
        console.error('Could not fetch lead profile details:', err);
      }
    };
    fetchLeadDetails();
  }, [selectedLeadId]);

  const handleCopyOutreach = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLinkedin = (text: string) => {
    navigator.clipboard.writeText(text);
    setLinkedinCopied(true);
    setTimeout(() => setLinkedinCopied(false), 2000);
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this prospect lead from the database?')) return;
    try {
      const result = await api.deleteLead(id);
      if (result.success) {
        setSelectedLeadId(null);
        setDrawerOpen(false);
        // Reload directory
        loadLeads();
      }
    } catch (err: any) {
      alert(`Could not delete lead entry: ${err.message}`);
    }
  };

  // Extract dynamic list of unique industries for filters
  const uniqueIndustries = Array.from(
    new Set(leads.map((item) => item.industry).filter((ind): ind is string => !!ind))
  );

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Prospect Directory</h1>
        <p className="page-subtitle">Inspect qualified leads categorized by Gemini scoring algorithms. Access high-converting personalized outreach copy.</p>
      </div>

      {/* Directory Table Card Panel */}
      <div className="leads-table-container">
        
        {/* Interactive Filters Panel */}
        <div className="leads-filter-bar">
          <div className="filter-input-wrapper">
            <Search className="filter-search-icon" />
            <input
              type="text"
              placeholder="Search companies, contacts, or emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-search"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Priorities</option>
            <option value="OUTREACH_READY">Outreach Ready</option>
            <option value="NEW">New Leads</option>
            <option value="DISQUALIFIED">Disqualified</option>
          </select>

          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Verticals</option>
            {uniqueIndustries.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>

        {/* Directory Content Table */}
        {loading && leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            Loading prospect directory...
          </div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            No leads match your search criteria. Try modifying your filters or launching a scavenger crawler.
          </div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Vertical</th>
                <th>Primary Contact</th>
                <th>Email Address</th>
                <th>Fit Tier</th>
                <th>Fit Score</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const isHigh = (lead.leadScore || 0) >= 85;
                const isMed = (lead.leadScore || 0) >= 55 && (lead.leadScore || 0) < 85;

                return (
                  <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
                    <td>
                      <div className="lead-company-name">{lead.companyName}</div>
                      {lead.website && (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="lead-website"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {new URL(lead.website).hostname} <ExternalLink size={10} />
                        </a>
                      )}
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Briefcase size={14} style={{ color: 'var(--text-muted)' }} />
                        {lead.industry || 'Unknown'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{lead.contactName || 'CEO/Founder'}</div>
                      {lead.contactRole && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {lead.contactRole}
                        </div>
                      )}
                    </td>
                    <td>
                      {lead.email ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                          <Mail size={14} style={{ color: 'var(--text-muted)' }} />
                          {lead.email}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${isHigh ? 'priority-high' : isMed ? 'priority-medium' : 'priority-low'}`}>
                        {isHigh ? 'High Priority' : isMed ? 'Medium' : 'Low'}
                      </span>
                    </td>
                    <td>
                      <div className={`score-circle ${isHigh ? 'high' : isMed ? 'medium' : 'low'}`}>
                        {lead.leadScore || 50}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Slide-Out Lead Profile Detail Drawer Panel */}
      <div 
        className={`detail-panel-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => {
          setSelectedLeadId(null);
          setDrawerOpen(false);
        }}
      >
        <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
          {selectedLead ? (
            <>
              {/* Header section (fixed at top) */}
              <div className="detail-header" style={{ marginBottom: '20px', paddingBottom: '16px', flexShrink: 0 }}>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word', paddingRight: '12px' }}>
                    {selectedLead.companyName}
                  </h2>
                  {selectedLead.website && (
                    <a
                      href={selectedLead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: 'var(--accent-violet)',
                        textDecoration: 'none',
                        marginTop: '4px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                      Visit Corporate Website <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <button
                  className="detail-close-btn"
                  onClick={() => {
                    setSelectedLeadId(null);
                    setDrawerOpen(false);
                  }}
                  style={{ flexShrink: 0 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="detail-body">
                {/* Grid ICP scoring summary */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '28px' }}>
                  <div style={{
                    flexGrow: 1,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                  }}>
                    <div className={`score-circle ${(selectedLead.leadScore || 0) >= 85 ? 'high' : (selectedLead.leadScore || 0) >= 55 ? 'medium' : 'low'}`} style={{ width: '48px', height: '48px', fontSize: '18px' }}>
                      {selectedLead.leadScore || 50}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>ICP Match Rating</div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {(selectedLead.leadScore || 0) >= 85 ? 'Highly Aligned Match' : (selectedLead.leadScore || 0) >= 55 ? 'Moderate Match' : 'Unmatched'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 1: Qualitive fit analysis */}
                <div className="detail-section">
                  <h3 className="detail-section-title">AI ICP Matching Rationale</h3>
                  <div className="reasoning-box">
                    {selectedLead.metadata?.reasoning || 'No analysis feedback collected.'}
                  </div>
                </div>

                {/* Section 2: Scraped insights */}
                <div className="detail-section">
                  <h3 className="detail-section-title">Extracted Metadata</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Target Vertical:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selectedLead.industry || 'Tech startup'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Primary Email:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selectedLead.email || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Lead Scraped Text:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selectedLead.metadata?.scrapedTextLength ? `${selectedLead.metadata.scrapedTextLength} characters` : '—'}</span>
                    </div>
                    {selectedLead.metadata?.extractedDescription && (
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Homepage Description:</span>
                        <p style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{selectedLead.metadata.extractedDescription}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Custom copyable outreach */}
                {selectedLead.outreachMessage && (
                  <div className="detail-section">
                    <h3 className="detail-section-title">Gemini Outreach Copilot</h3>
                    <div className="outreach-box-container">
                      <button
                        className="outreach-copy-btn"
                        onClick={() => handleCopyOutreach(selectedLead.outreachMessage || '')}
                      >
                        {copied ? (
                          <>
                            <Check size={12} />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy Copy</span>
                          </>
                        )}
                      </button>
                      <div className="outreach-text">
                        {selectedLead.outreachMessage}
                      </div>
                    </div>
                  </div>
                )}

                {/* Section 4: LinkedIn Outreach Copilot */}
                {(selectedLead.linkedinUrl || selectedLead.linkedinMessage) && (
                  <div className="detail-section">
                    <h3 className="detail-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <LinkedinIcon size={16} style={{ color: '#0a66c2' }} />
                      <span>LinkedIn Outreach Copilot</span>
                    </h3>
                    
                    {selectedLead.linkedinUrl && (
                      <div style={{ marginBottom: '12px' }}>
                        <a
                          href={selectedLead.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(10, 102, 194, 0.1)',
                            border: '1px solid rgba(10, 102, 194, 0.2)',
                            color: '#0a66c2',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            textDecoration: 'none',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(10, 102, 194, 0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(10, 102, 194, 0.1)';
                          }}
                        >
                          <LinkedinIcon size={12} />
                          <span>View Discovered Profile</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    )}

                    {selectedLead.linkedinMessage && (
                      <div className="outreach-box-container">
                        <button
                          className="outreach-copy-btn"
                          onClick={() => handleCopyLinkedin(selectedLead.linkedinMessage || '')}
                        >
                          {linkedinCopied ? (
                            <>
                              <Check size={12} />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy Note</span>
                            </>
                          )}
                        </button>
                        <div className="outreach-text" style={{ fontSize: '13px', fontStyle: 'italic' }}>
                          {selectedLead.linkedinMessage}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: selectedLead.linkedinMessage.length > 300 ? 'var(--accent-rose)' : 'var(--text-muted)',
                          marginTop: '8px',
                          textAlign: 'right',
                          fontWeight: 500
                        }}>
                          {selectedLead.linkedinMessage.length} / 300 characters
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 5: Actions (fixed at bottom) */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                <button
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent-rose-glow)';
                    e.currentTarget.style.borderColor = 'var(--accent-rose)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                  }}
                >
                  <Trash2 size={14} />
                  <span>Delete Prospect</span>
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
              Loading lead details...
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default LeadsPage;
