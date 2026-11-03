import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { ManagerDashboardData } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';

const metric = (value: number | null, suffix = ''): string =>
  value === null ? '—' : `${value}${suffix}`;

export default function SalesAnalyticsPage() {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const result = await api.fetchManagerDashboard();
      setData(result);
    } catch (error) {
      console.error('Failed to load manager dashboard:', error);
      setLoadError(error instanceof Error ? error.message : 'Could not load analytics right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="analytics-state" role="status" aria-live="polite">
        <RefreshCw size={20} className="animate-spin" />
        <span>Loading sales analytics…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="manager-analytics-page">
        <PageHeader
          eyebrow="Performance"
          title="Sales analytics"
          description="Pipeline health, conversion rates, response intent, and system activity."
          icon={BarChart3}
        />
        <Panel className="analytics-error-state" role="alert">
          <AlertCircle size={20} />
          <div><strong>Analytics could not be loaded</strong><p>{loadError || 'Try again in a moment.'}</p></div>
          <button onClick={loadDashboard} className="btn btn-secondary" type="button">
            <RefreshCw size={14} /> Try again
          </button>
        </Panel>
      </div>
    );
  }

  const funnelPeak = Math.max(...data.funnel.map((step) => step.count), 0);

  return (
    <div className="manager-analytics-page">
      <PageHeader
        eyebrow="Performance"
        title="Sales analytics"
        description="Pipeline health, conversion rates, response intent, and system activity."
        icon={BarChart3}
        actions={(
          <button onClick={loadDashboard} disabled={loading} className="btn btn-secondary analytics-refresh" type="button">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh metrics'}
          </button>
        )}
      />

      {loadError && (
        <div className="analytics-inline-error" role="status">
          <AlertCircle size={15} /><span>Refresh failed: {loadError}</span>
          <button type="button" onClick={loadDashboard}>Retry</button>
        </div>
      )}

      <section className="analytics-kpi-grid" aria-label="Pipeline overview">
        <Panel className="analytics-kpi">
          <div className="analytics-kpi-top"><span>Total pipeline leads</span><span className="analytics-kpi-icon"><Users size={16} /></span></div>
          <strong>{data.overview.totalLeads.toLocaleString()}</strong>
          <small>{data.overview.qualifiedLeads.toLocaleString()} qualified prospects</small>
        </Panel>
        <Panel className="analytics-kpi">
          <div className="analytics-kpi-top"><span>Qualification rate</span><span className="analytics-kpi-icon green"><ShieldCheck size={16} /></span></div>
          <strong className="green-text">{metric(data.overview.qualificationRatePercent, '%')}</strong>
          <small>{data.overview.qualificationRatePercent === null ? 'No leads imported yet' : 'Based on deterministic rules'}</small>
        </Panel>
        <Panel className="analytics-kpi">
          <div className="analytics-kpi-top"><span>Reply rate</span><span className="analytics-kpi-icon blue"><TrendingUp size={16} /></span></div>
          <strong className="blue-text">{metric(data.overview.responseRatePercent, '%')}</strong>
          <small>{data.overview.responseRatePercent === null ? 'No outreach sent yet' : 'Of contacted leads'}</small>
        </Panel>
        <Panel className="analytics-kpi">
          <div className="analytics-kpi-top"><span>Average account score</span><span className="analytics-kpi-icon amber"><Award size={16} /></span></div>
          <strong className="amber-text">{metric(data.overview.averageLeadScore)}<small>{data.overview.averageLeadScore !== null ? ' / 100' : ''}</small></strong>
          <small>{data.overview.averageLeadScore === null ? 'Nothing scored yet' : 'Weighted multi-factor score'}</small>
        </Panel>
      </section>

      <section className="analytics-primary-grid" aria-label="Pipeline and response analytics">
        <Panel className="analytics-panel">
          <div className="analytics-panel-heading">
            <div><span className="analytics-panel-icon"><TrendingUp size={16} /></span><div><h2>Lead transformation funnel</h2><p>Lead volume across pipeline stages</p></div></div>
            <span className="analytics-panel-meta">{data.overview.totalLeads.toLocaleString()} leads</span>
          </div>
          {data.funnel.length ? (
            <div className="analytics-funnel-list">
              {data.funnel.map((step, index) => {
                const width = funnelPeak > 0 ? (step.count / funnelPeak) * 100 : 0;
                return (
                  <div className="analytics-funnel-row" key={`${step.stage}-${index}`}>
                    <div className="analytics-funnel-label">
                      <span className="analytics-funnel-index">{String(index + 1).padStart(2, '0')}</span>
                      <span>{step.stage}</span>
                      <strong>{step.count.toLocaleString()}</strong>
                    </div>
                    <div className="analytics-track" role="img" aria-label={`${step.stage}: ${step.count} leads`}>
                      <span style={{ width: `${width}%` }} />
                    </div>
                    {step.dropoff !== null && step.dropoff > 0 && <small className="analytics-dropoff">{step.dropoff}% drop from previous stage</small>}
                  </div>
                );
              })}
            </div>
          ) : <div className="analytics-empty">No funnel activity yet. Import leads to populate this view.</div>}
        </Panel>

        <Panel className="analytics-panel">
          <div className="analytics-panel-heading">
            <div><span className="analytics-panel-icon green"><ShieldCheck size={16} /></span><div><h2>Reply intent</h2><p>Inbound response classifications</p></div></div>
          </div>
          <div className="analytics-intent-grid">
            <div className="analytics-intent interested"><span>Interested</span><strong>{data.responseClassifications.interested}</strong><small>Meeting requested</small></div>
            <div className="analytics-intent follow-up"><span>Follow up</span><strong>{data.responseClassifications.followUp}</strong><small>Timing or nurture</small></div>
            <div className="analytics-intent not-interested"><span>Not interested</span><strong>{data.responseClassifications.notInterested}</strong><small>Declined</small></div>
            <div className="analytics-intent unsubscribe"><span>Unsubscribe</span><strong>{data.responseClassifications.unsubscribe}</strong><small>Suppressed</small></div>
          </div>
        </Panel>
      </section>

      <section className="analytics-secondary-grid" aria-label="Team and system analytics">
        <Panel className="analytics-panel">
          <div className="analytics-panel-heading">
            <div><span className="analytics-panel-icon amber"><Award size={16} /></span><div><h2>Team performance</h2><p>Assignment, review activity, and average score</p></div></div>
          </div>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <caption className="sr-only">Sales representative performance</caption>
              <thead><tr><th scope="col">Sales rep</th><th scope="col">Role</th><th scope="col">Assigned</th><th scope="col">Reviewed</th><th scope="col">Avg. score</th></tr></thead>
              <tbody>
                {data.teamPerformance.length ? data.teamPerformance.map((user) => (
                  <tr key={user.userId}>
                    <td className="analytics-person"><span>{user.name.slice(0, 1).toUpperCase()}</span>{user.name}</td>
                    <td>{user.role}</td><td>{user.assignedLeadsCount}</td><td>{user.reviewedMessagesCount}</td><td className="analytics-score">{user.averageScore}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="analytics-table-empty">No team activity to show yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="analytics-panel">
          <div className="analytics-panel-heading">
            <div><span className="analytics-panel-icon"><Cpu size={16} /></span><div><h2>System reliability</h2><p>Pipeline operations and AI usage</p></div></div>
          </div>
          <div className="analytics-system-grid">
            <div className="analytics-system-metric"><span><Clock size={13} />Average pipeline latency</span><strong>{data.observability.averageLatencyMs}<small> ms</small></strong></div>
            <div className="analytics-system-metric"><span><DollarSign size={13} />Estimated AI cost</span><strong>${data.observability.estimatedAiCostUSD}</strong></div>
            <div className="analytics-system-metric"><span><Cpu size={13} />Active queue</span><strong>{data.observability.activeQueueSize}<small> jobs</small></strong></div>
            <div className="analytics-system-metric"><span>{data.observability.dlq === 0 ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}Dead-letter queue</span><strong className={data.observability.dlq === 0 ? 'green-text' : 'red-text'}>{data.observability.dlq}<small> errors</small></strong></div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
