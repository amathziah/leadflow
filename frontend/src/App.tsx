import { useState, useEffect } from 'react';
import { LayoutDashboard, Cpu, Users, Compass, Server } from 'lucide-react';
import DashboardHome from './components/DashboardHome';
import WorkflowsPage from './components/WorkflowsPage';
import LeadsPage from './components/LeadsPage';

type Tab = 'dashboard' | 'workflows' | 'leads';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [serverOnline, setServerOnline] = useState<boolean>(true);

  // Check health of backend api at startup
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('http://localhost:4000/health');
        if (response.ok) {
          setServerOnline(true);
        } else {
          setServerOnline(false);
        }
      } catch {
        setServerOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <Compass size={24} />
          </div>
          <span className="logo-text">LeadFlow AI</span>
        </div>

        <ul className="nav-links">
          <li>
            <div
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard className="icon" />
              <span>Dashboard</span>
            </div>
          </li>
          <li>
            <div
              className={`nav-item ${activeTab === 'workflows' ? 'active' : ''}`}
              onClick={() => setActiveTab('workflows')}
            >
              <Cpu className="icon" />
              <span>AI Scavengers</span>
            </div>
          </li>
          <li>
            <div
              className={`nav-item ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('leads')}
            >
              <Users className="icon" />
              <span>Qualified Leads</span>
            </div>
          </li>
        </ul>

        <div className="sidebar-footer">
          <div
            className="status-indicator"
            style={{
              background: serverOnline ? '#10b981' : '#ef4444',
              boxShadow: serverOnline ? '0 0 10px #10b981' : '0 0 10px #ef4444',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="status-text" style={{ color: serverOnline ? '#f8fafc' : '#94a3b8' }}>
              {serverOnline ? 'Backend Active' : 'Offline'}
            </span>
            <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Server size={10} /> Local engine
            </span>
          </div>
        </div>
      </aside>

      {/* Main Core View Area */}
      <main className="main-content">
        {/* Sleek background decoration blurs */}
        <div className="bg-glow-1" />
        <div className="bg-glow-2" />

        {activeTab === 'dashboard' && (
          <DashboardHome 
            onNavigateToWorkflows={() => setActiveTab('workflows')} 
            onNavigateToLeads={() => setActiveTab('leads')}
          />
        )}
        {activeTab === 'workflows' && <WorkflowsPage />}
        {activeTab === 'leads' && <LeadsPage />}
      </main>
    </div>
  );
}

export default App;
