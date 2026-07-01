import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Lead, Workflow } from '../services/api';
import { Users, Play, TrendingUp, Activity, ArrowRight, ShieldCheck } from 'lucide-react';

interface DashboardHomeProps {
  onNavigateToWorkflows: () => void;
  onNavigateToLeads: () => void;
}

const DashboardHome: React.FC<DashboardHomeProps> = ({
  onNavigateToWorkflows,
  onNavigateToLeads,
}) => {
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Fetch summaries at mount
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [leadsData, workflowsData] = await Promise.all([
          api.getLeads({ limit: 5 }),
          api.getWorkflows(),
        ]);
        setLeads(leadsData.data || []);
        setWorkflows(workflowsData.data || []);
      } catch (err) {
        console.error('Error fetching dashboard summary statistics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleTriggerScavenger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setTriggering(true);
    setSuccessMsg('');
    try {
      const result = await api.triggerWorkflow(query);
      if (result.success) {
        setSuccessMsg(`AI Scavenger triggered successfully for query: "${query}"!`);
        setQuery('');
        // Refresh workflows history list
        const updatedWorkflows = await api.getWorkflows();
        setWorkflows(updatedWorkflows.data || []);
      }
    } catch (err: any) {
      alert(`Could not start workflow: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  };

  // Compute metric calculations
  const activeWorkflowsCount = workflows.filter((w) => w.status === 'RUNNING' || w.status === 'PENDING').length;
  const avgLeadScore = leads.length > 0 
    ? Math.round(leads.reduce((sum, item) => sum + (item.leadScore || 0), 0) / leads.length) 
    : 0;
  const highPriorityLeadsCount = leads.filter((item) => (item.leadScore || 0) >= 85).length;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Sales Intelligence Hub</h1>
        <p className="page-subtitle">Configure Playwright browser stealth scavengers and Gemini reasoning models to discover ICP leads.</p>
      </div>

      {/* Analytics Overview Cards */}
      <section className="card-grid">
        <div className="stat-card violet">
          <div className="stat-icon-wrapper">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{loading ? '...' : leads.length * 3 || 0}</span>
            <span className="stat-label">Total Leads Found</span>
          </div>
        </div>

        <div className="stat-card emerald">
          <div className="stat-icon-wrapper">
            <Activity size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{loading ? '...' : activeWorkflowsCount}</span>
            <span className="stat-label">Active Scavengers</span>
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-icon-wrapper">
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{loading ? '...' : `${avgLeadScore || 0}%`}</span>
            <span className="stat-label">Avg Lead Fit Score</span>
          </div>
        </div>

        <div className="stat-card rose">
          <div className="stat-icon-wrapper">
            <ShieldCheck size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{loading ? '...' : highPriorityLeadsCount}</span>
            <span className="stat-label">High-Priority Matches</span>
          </div>
        </div>
      </section>

      {/* Main Scavenger Query Form */}
      <section className="scavenger-panel">
        <h2 className="scavenger-title">Deploy AI Scavenger Scraper</h2>
        <p className="scavenger-desc">
          Describe your ideal target lead company profile. The platform will launch a Playwright browser instance, perform search, deep crawl relevant websites, evaluate ICP fit using Gemini 2.5-Pro, and customize a cold email draft using Gemini 2.5-Flash.
        </p>

        <form onSubmit={handleTriggerScavenger} className="scavenger-form">
          <div className="scavenger-input-container">
            <input
              type="text"
              placeholder="e.g. B2B SaaS marketing agencies in Sydney or Generative AI startups in San Francisco with funding"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="scavenger-input"
              disabled={triggering}
            />
          </div>
          <button type="submit" disabled={triggering || !query.trim()} className="scavenger-button">
            {triggering ? 'Launching...' : 'Trigger Scavenger'}
            <Play size={16} />
          </button>
        </form>

        {successMsg && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'var(--accent-emerald-glow)',
            border: '1px solid var(--accent-emerald)',
            borderRadius: '10px',
            color: '#6ee7b7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} /> {successMsg}
            </span>
            <button
              onClick={onNavigateToWorkflows}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              Watch Live <ArrowRight size={12} />
            </button>
          </div>
        )}
      </section>

      {/* Grid: Recent Leads & Recent Runs */}
      <div className="dashboard-grid">
        {/* Left Side: Recent Discovered Leads */}
        <div className="panel-card" style={{ height: 'auto', minHeight: '380px' }}>
          <div className="panel-header">
            <h3 className="panel-title">
              <ShieldCheck size={20} style={{ color: 'var(--accent-emerald)' }} />
              Highly Scored Leads
            </h3>
            <button
              onClick={onNavigateToLeads}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-violet)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              View Directory <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                Loading qualified leads...
              </div>
            ) : leads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No qualified leads found yet. Input a query above to start scavenging.
              </div>
            ) : (
              leads.map((lead) => {
                const isHigh = (lead.leadScore || 0) >= 85;
                const isMed = (lead.leadScore || 0) >= 55 && (lead.leadScore || 0) < 85;

                return (
                  <div
                    key={lead.id}
                    onClick={onNavigateToLeads}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-violet)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{lead.companyName}</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {lead.industry || 'Tech startup'} • {lead.email || 'No email collected'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`badge ${isHigh ? 'priority-high' : isMed ? 'priority-medium' : 'priority-low'}`}>
                        {isHigh ? 'High Priority' : isMed ? 'Medium' : 'Low'}
                      </span>
                      <div className={`score-circle ${isHigh ? 'high' : isMed ? 'medium' : 'low'}`}>
                        {lead.leadScore || 50}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Active/Recent Web Crawlers */}
        <div className="panel-card" style={{ height: 'auto', minHeight: '380px' }}>
          <div className="panel-header">
            <h3 className="panel-title">
              <Activity size={20} style={{ color: 'var(--accent-violet)' }} />
              Scavenger History
            </h3>
            <button
              onClick={onNavigateToWorkflows}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-violet)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              Watch Logs <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                Loading runs...
              </div>
            ) : workflows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No active or past web scavenger runs found.
              </div>
            ) : (
              workflows.slice(0, 4).map((wf) => {
                const isRunning = wf.status === 'RUNNING';
                const isComp = wf.status === 'COMPLETED';
                const isFail = wf.status === 'FAILED';

                return (
                  <div
                    key={wf.id}
                    onClick={onNavigateToWorkflows}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-violet)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(wf.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      "{wf.query}"
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
