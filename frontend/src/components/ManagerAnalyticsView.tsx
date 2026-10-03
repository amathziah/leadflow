import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { ManagerDashboardData } from '../services/api';
import {
  BarChart3,
  TrendingUp,
  Cpu,
  ShieldCheck,
  Zap,
  Clock,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Award,
} from 'lucide-react';

/**
 * Renders a metric that may genuinely have no value yet.
 *
 * An empty pipeline has no qualification rate — showing "0%" implies a
 * measured failure, and showing an invented number is worse. Both read as
 * data; an em dash reads as "not yet measurable", which is the truth.
 */
const metric = (value: number | null, suffix = ''): string =>
  value === null ? '—' : `${value}${suffix}`;

export default function ManagerAnalyticsView() {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.fetchManagerDashboard();
      setData(res);
    } catch (err) {
      console.error('Failed to load manager dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading || !data) {
    return (
      <div className="empty-state p-12">
        <RefreshCw size={36} className="animate-spin text-indigo-400 mb-2" />
        <p>Loading Sales Manager Telemetry & Analytics...</p>
      </div>
    );
  }

  return (
    <div className="manager-analytics-page">
      <div className="pipeline-header">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="text-indigo-400" size={26} />
            Sales Manager Observability & Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time pipeline metrics, team performance, qualification conversion rates, and queue telemetry.
          </p>
        </div>

        <button onClick={loadDashboard} className="btn btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Metrics
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
        <div className="dossier-card">
          <span className="text-xs text-slate-400 font-medium">Total Pipeline Leads</span>
          <div className="text-2xl font-black text-white mt-1">{data.overview.totalLeads}</div>
          <span className="text-xs text-emerald-400 font-semibold mt-1 block">
            {data.overview.qualifiedLeads} Qualified Prospects
          </span>
        </div>

        <div className="dossier-card">
          <span className="text-xs text-slate-400 font-medium">Qualification Rate</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {metric(data.overview.qualificationRatePercent, '%')}
          </div>
          <span className="text-xs text-slate-400 mt-1 block">
            {data.overview.qualificationRatePercent === null
              ? 'No leads imported yet'
              : 'Deterministic rules, no LLM'}
          </span>
        </div>

        <div className="dossier-card">
          <span className="text-xs text-slate-400 font-medium">Reply Rate</span>
          <div className="text-2xl font-black text-indigo-400 mt-1">
            {metric(data.overview.responseRatePercent, '%')}
          </div>
          <span className="text-xs text-indigo-300 mt-1 block">
            {data.overview.responseRatePercent === null
              ? 'No outreach sent yet'
              : 'Of contacted leads'}
          </span>
        </div>

        <div className="dossier-card">
          <span className="text-xs text-slate-400 font-medium">Average Account Score</span>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {metric(data.overview.averageLeadScore)}
            {data.overview.averageLeadScore !== null && (
              <span className="text-sm text-slate-400 font-normal"> / 100</span>
            )}
          </div>
          <span className="text-xs text-slate-400 mt-1 block">
            {data.overview.averageLeadScore === null
              ? 'Nothing scored yet'
              : 'Version-controlled weights'}
          </span>
        </div>
      </div>

      {/* Funnel & Intents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Conversion Funnel */}
        <div className="dossier-card">
          <h3 className="section-title">
            <TrendingUp size={16} className="text-indigo-400" />
            Lead Transformation Funnel
          </h3>
          <div className="space-y-3 mt-4">
            {data.funnel.map((step, idx) => {
              // Bars are relative to the widest stage, so the funnel reads as a
              // funnel. A stage with no leads renders as an empty track — the
              // previous `Math.max(12, …)` floor drew every bar as partly full
              // even when every count was zero.
              const peak = Math.max(...data.funnel.map((s) => s.count), 0);
              const width = peak > 0 ? (step.count / peak) * 100 : 0;

              return (
                <div key={idx} className="funnel-step">
                  <div className="flex items-center justify-between text-xs mb-1 gap-2">
                    <span className="font-semibold text-slate-200 truncate">
                      {idx + 1}. {step.stage}
                    </span>
                    <span className="font-bold text-white whitespace-nowrap">
                      {step.count.toLocaleString()}
                      {step.dropoff !== null && step.dropoff > 0 && (
                        <span className="text-slate-400 font-normal"> ({step.dropoff}% drop)</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-[width] duration-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inbound Response Classifications */}
        <div className="dossier-card">
          <h3 className="section-title">
            <ShieldCheck size={16} className="text-emerald-400" />
            Inbound Reply Intent Distribution
          </h3>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60">
              <span className="text-xs font-semibold text-emerald-400 block">INTERESTED</span>
              <span className="text-2xl font-bold text-white mt-1 block">
                {data.responseClassifications.interested}
              </span>
              <span className="text-[11px] text-slate-400">Meeting requested</span>
            </div>

            <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/60">
              <span className="text-xs font-semibold text-indigo-400 block">FOLLOW UP</span>
              <span className="text-2xl font-bold text-white mt-1 block">
                {data.responseClassifications.followUp}
              </span>
              <span className="text-[11px] text-slate-400">Timing objections / nurture</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-xs font-semibold text-slate-400 block">NOT INTERESTED</span>
              <span className="text-2xl font-bold text-white mt-1 block">
                {data.responseClassifications.notInterested}
              </span>
              <span className="text-[11px] text-slate-400">Polite declines</span>
            </div>

            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60">
              <span className="text-xs font-semibold text-rose-400 block">UNSUBSCRIBE</span>
              <span className="text-2xl font-bold text-white mt-1 block">
                {data.responseClassifications.unsubscribe}
              </span>
              <span className="text-[11px] text-slate-400">Suppressed domains</span>
            </div>
          </div>
        </div>
      </div>

      {/* Team Performance & System Reliability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Team Performance */}
        <div className="dossier-card">
          <h3 className="section-title">
            <Award size={16} className="text-amber-400" />
            SDR & AE Team Performance
          </h3>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2">Sales Rep</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Assigned</th>
                  <th className="pb-2">Reviewed</th>
                  <th className="pb-2">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {data.teamPerformance.map((user) => (
                  <tr key={user.userId}>
                    <td className="py-2.5 font-semibold text-white">{user.name}</td>
                    <td className="py-2.5 text-slate-400">{user.role}</td>
                    <td className="py-2.5">{user.assignedLeadsCount}</td>
                    <td className="py-2.5">{user.reviewedMessagesCount}</td>
                    <td className="py-2.5 font-bold text-emerald-400">{user.averageScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reliability & Observability */}
        <div className="dossier-card">
          <h3 className="section-title">
            <Zap size={16} className="text-amber-400" />
            System Reliability & AI Economics
          </h3>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock size={12} /> Avg Pipeline Latency
              </span>
              <span className="text-xl font-bold text-white mt-1 block">
                {data.observability.averageLatencyMs}ms
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <DollarSign size={12} /> Estimated AI Cost
              </span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">
                ${data.observability.estimatedAiCostUSD}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Cpu size={12} /> Active Queue Size
              </span>
              <span className="text-xl font-bold text-white mt-1 block">
                {data.observability.activeQueueSize} jobs
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <AlertTriangle size={12} /> Dead-Letter Queue (DLQ)
              </span>
              <span className={`text-xl font-bold mt-1 block ${data.observability.dlq === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.observability.dlq} errors
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
