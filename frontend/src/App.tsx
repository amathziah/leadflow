import { useState, useEffect } from 'react';
import {
  Building2,
  ShieldAlert,
  MessageSquareQuote,
  Target,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import LeadPipelinePage from './pages/LeadPipelinePage';
import OutreachReviewPage from './pages/OutreachReviewPage';
import ReplyTriagePage from './pages/ReplyTriagePage';
import IcpSettingsPage from './pages/IcpSettingsPage';
import SalesAnalyticsPage from './pages/SalesAnalyticsPage';

type Tab = 'pipeline' | 'outreach' | 'responses' | 'icp' | 'analytics';

const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      {
        id: 'pipeline' as Tab,
        label: 'Lead Intelligence',
        icon: Building2,
        description: 'Pipeline & 360° view',
      },
      {
        id: 'outreach' as Tab,
        label: 'Human Review',
        icon: ShieldAlert,
        badge: 'Gate',
        badgeClass: 'nav-badge-amber',
        description: 'Approve outreach drafts',
      },
      {
        id: 'responses' as Tab,
        label: 'Reply Triage',
        icon: MessageSquareQuote,
        description: 'Inbound response analysis',
      },
    ],
  },
  {
    label: 'Configuration',
    items: [
      {
        id: 'icp' as Tab,
        label: 'ICP Studio',
        icon: Target,
        description: 'Qualification rules',
      },
      {
        id: 'analytics' as Tab,
        label: 'Analytics',
        icon: BarChart3,
        description: 'Manager dashboard',
      },
    ],
  },
];

const TAB_META: Record<Tab, { title: string }> = {
  pipeline:  { title: 'Lead intelligence' },
  outreach:  { title: 'Outreach review' },
  responses: { title: 'Reply triage' },
  icp:       { title: 'ICP settings' },
  analytics: { title: 'Sales analytics' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('http://localhost:4000/health');
        setServerOnline(r.ok);
      } catch {
        setServerOnline(false);
      }
    };
    check();
    const iv = setInterval(check, 15_000);
    return () => clearInterval(iv);
  }, []);

  const meta = TAB_META[activeTab];

  return (
    <div className={`app-root ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <button
          className="sidebar-logo sidebar-logo-toggle"
          type="button"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          aria-controls="primary-navigation"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <div className="sidebar-logo-icon">
            <TrendingUp size={16} strokeWidth={2.5} />
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">
              LeadFlow<span style={{ color: 'var(--brand)' }}>AI</span>
            </span>
            <span className="sidebar-logo-tag">Intelligence Engine</span>
          </div>
        </button>

        {/* Nav */}
        <nav className="sidebar-nav" id="primary-navigation" aria-label="Primary navigation">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="nav-section-label">{section.label}</p>
              {section.items.map(({ id, label, icon: Icon, badge, badgeClass }) => (
                <button
                  key={id}
                  className={`nav-item ${activeTab === id ? 'active' : ''}`}
                  onClick={() => setActiveTab(id)}
                  type="button"
                  aria-label={label}
                  aria-current={activeTab === id ? 'page' : undefined}
                  title={label}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-label">{label}</span>
                  {badge && (
                    <span className={`nav-badge ${badgeClass || ''}`}>{badge}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Engine status */}
        <div className="sidebar-footer">
          <div
            className="engine-card"
            title={serverOnline ? 'Engine Online · Deterministic + Gemini' : 'Engine status'}
          >
            <span
              className={`engine-dot ${
                serverOnline === null ? '' : serverOnline ? 'online' : 'offline'
              }`}
              style={serverOnline === null ? { background: 'var(--text-secondary)' } : undefined}
            />
            <div className="engine-info">
              <span className="engine-status">
                {serverOnline === null
                  ? 'Checking...'
                  : serverOnline
                  ? 'Engine Online'
                  : 'Engine Offline'}
              </span>
              <span className="engine-sub">
                {serverOnline
                  ? 'Deterministic + Gemini'
                  : 'Start backend on :4000'}
              </span>
            </div>
            {serverOnline !== null && (
              serverOnline
                ? <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                : <AlertCircle  size={13} style={{ color: 'var(--danger)',  flexShrink: 0 }} />
            )}
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div>
            {/* Breadcrumb */}
            <div className="topbar-breadcrumb">
              <span>LeadFlow AI</span>
              <ChevronRight size={13} />
              <span className="topbar-current">{meta.title}</span>
            </div>
          </div>

          <div className="topbar-actions">
            {/* Offline banner */}
            {serverOnline === false && (
              <div className="alert alert-error topbar-offline">
                <AlertCircle size={13} />
                Backend offline — run <code style={{ fontFamily: 'monospace', marginLeft: 4 }}>npm run dev</code>
              </div>
            )}
            <div
              className="account-avatar"
              title="Account"
            >
              S
            </div>
          </div>
        </header>

        {/* Page body */}
        <main className="page-content">
          {activeTab === 'pipeline'  && <LeadPipelinePage onOpenOutreachReview={() => setActiveTab('outreach')} />}
          {activeTab === 'outreach'  && <OutreachReviewPage />}
          {activeTab === 'responses' && <ReplyTriagePage />}
          {activeTab === 'icp'       && <IcpSettingsPage />}
          {activeTab === 'analytics' && <SalesAnalyticsPage />}
        </main>
      </div>
    </div>
  );
}
