import { useState, useEffect } from 'react';
import {
  Building2,
  ShieldAlert,
  MessageSquareQuote,
  Target,
  BarChart3,
  TrendingUp,
  Server,
} from 'lucide-react';
import LeadPipelineView from './components/LeadPipelineView';
import OutreachReviewCenter from './components/OutreachReviewCenter';
import ReplyTriageView from './components/ReplyTriageView';
import IcpManagerView from './components/IcpManagerView';
import ManagerAnalyticsView from './components/ManagerAnalyticsView';
import './App.css';

type Tab = 'pipeline' | 'outreach' | 'responses' | 'icp' | 'analytics';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [serverOnline, setServerOnline] = useState<boolean>(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('http://localhost:4000/health');
        setServerOnline(res.ok);
      } catch {
        setServerOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const navItems: { id: Tab; label: string; icon: any; badge?: string }[] = [
    { id: 'pipeline', label: 'Lead Intelligence', icon: Building2 },
    { id: 'outreach', label: 'Human Review', icon: ShieldAlert, badge: 'Gate' },
    { id: 'responses', label: 'Reply Triage', icon: MessageSquareQuote },
    { id: 'icp', label: 'ICP Studio', icon: Target },
    { id: 'analytics', label: 'Manager Analytics', icon: BarChart3 },
  ];

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <TrendingUp size={22} color="#ffffff" />
          </div>
          <div>
            <span className="logo-text">LeadFlow AI</span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                display: 'block',
                fontWeight: '600',
                letterSpacing: '0.06em',
              }}
            >
              INTELLIGENCE PLATFORM
            </span>
          </div>
        </div>

        <ul className="nav-links">
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <li key={id}>
              <div
                id={`nav-${id}`}
                className={`nav-item ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon className="icon" />
                <span>{label}</span>
                {badge && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/80 font-bold">
                    {badge}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Sidebar Footer with Engine Telemetry Status */}
        <div className="sidebar-footer">
          <div
            className="status-indicator"
            style={{
              background: serverOnline ? 'var(--accent-emerald)' : 'var(--accent-rose)',
              boxShadow: serverOnline ? '0 0 10px rgba(16,185,129,0.6)' : 'none',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="status-text" style={{ color: serverOnline ? '#fff' : 'var(--text-muted)' }}>
              {serverOnline ? 'Engine Active' : 'Offline'}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <Server size={10} /> Deterministic + Gemini
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="bg-glow-1" />
        <div className="bg-glow-2" />

        <div className="content-container">
          {activeTab === 'pipeline' && (
            <LeadPipelineView onOpenOutreachReview={() => setActiveTab('outreach')} />
          )}
          {activeTab === 'outreach' && <OutreachReviewCenter />}
          {activeTab === 'responses' && <ReplyTriageView />}
          {activeTab === 'icp' && <IcpManagerView />}
          {activeTab === 'analytics' && <ManagerAnalyticsView />}
        </div>
      </main>
    </div>
  );
}

export default App;
