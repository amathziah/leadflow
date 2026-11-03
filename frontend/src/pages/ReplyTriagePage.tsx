import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { LeadItem } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import {
  MessageSquareQuote,
  Send,
  History,
  Search,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

/**
 * Reply Triage.
 *
 * Inbound prospect response classification, stage advance, lead memory and dynamic re-scoring.
 */

const INTENT_STYLES: Record<string, { color: string; bg: string; border: string; consequence: string }> = {
  INTERESTED: {
    color: 'text-emerald-700',
    bg: 'bg-emerald-50/80',
    border: 'border-l-emerald-600',
    consequence: 'Lead advanced to engaged, score increased, flagged for immediate follow-up.',
  },
  FOLLOW_UP: {
    color: 'text-amber-700',
    bg: 'bg-amber-50/80',
    border: 'border-l-amber-500',
    consequence: 'Lead kept warm with a scheduled re-touch; score modestly adjusted.',
  },
  NOT_INTERESTED: {
    color: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-l-slate-400',
    consequence: 'Lead demoted and removed from the active outreach queue.',
  },
  UNSUBSCRIBE: {
    color: 'text-rose-700',
    bg: 'bg-rose-50/80',
    border: 'border-l-rose-500',
    consequence: 'Lead suppressed permanently. No further outreach will be drafted.',
  },
};

export default function ReplyTriagePage() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.fetchLeads();
        setLeads(data);
        if (data.length > 0) {
          setSelectedLeadId(data[0].id);
          loadTimeline(data[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load leads.');
      }
    };
    load();
  }, []);

  const loadTimeline = async (id: string) => {
    try {
      setTimeline(await api.fetchLeadTimeline(id));
    } catch {
      setTimeline(null);
    }
  };

  const handleSelectLead = (id: string) => {
    setSelectedLeadId(id);
    setResult(null);
    setError(null);
    loadTimeline(id);
  };

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.fullName, l.companyName, l.role].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [leads, search]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;
  const previousScore = selectedLead?.leadScore ?? null;

  const handleTriage = async () => {
    if (!selectedLeadId || !replyText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.submitResponse(selectedLeadId, replyText.trim());
      setResult(res.data ?? res);
      await loadTimeline(selectedLeadId);
      // Refresh the list so the re-scored value is reflected in the picker.
      setLeads(await api.fetchLeads());
    } catch (err: any) {
      setError(err.message || 'Triage failed.');
    } finally {
      setLoading(false);
    }
  };

  const intentStyle = result ? INTENT_STYLES[result.classification] : null;
  const scoreDelta =
    result && previousScore !== null ? result.reScoredTotal - previousScore : null;

  return (
    <div className="reply-triage-page">
      <PageHeader
        eyebrow="Response intelligence"
        title="Reply triage"
        description="Classify prospect replies, update lead stages, and refresh qualification scores."
        icon={MessageSquareQuote}
      />

      <div className="pipeline-grid">
        {/* Left Column: who replied, and what they said */}
        <div className="leads-list-column">
          <div className="dossier-card">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Select Responding Lead
            </label>

            <div className="relative mb-2.5">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input text-xs pl-9"
                placeholder="Filter by name, company or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {leads.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                No leads yet. Import leads from the Lead Intelligence tab first.
              </p>
            ) : filteredLeads.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No leads match “{search}”.</p>
            ) : (
              <ul
                role="listbox"
                aria-label="Select the lead who replied"
                className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50"
              >
                {filteredLeads.map((l) => {
                  const active = l.id === selectedLeadId;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => handleSelectLead(l.id)}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                          active ? 'bg-blue-50/80 text-blue-900' : 'bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-[11px] text-slate-600 shrink-0">
                          {l.companyName?.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-900 truncate">{l.fullName}</span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            {l.companyName}
                            {l.role ? ` · ${l.role}` : ''}
                          </span>
                        </span>
                        <span
                          className={`text-xs font-bold shrink-0 tabular-nums ${
                            l.leadScore === null ? 'text-slate-400' : 'text-emerald-700 font-mono'
                          }`}
                        >
                          {l.leadScore ?? '—'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 pt-3.5 border-t border-slate-200">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
                Paste Inbound Reply Text
              </label>
              <textarea
                rows={7}
                className="form-textarea text-xs font-mono"
                placeholder="Paste the prospect's reply message exactly as received..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <button
                onClick={handleTriage}
                disabled={loading || !replyText.trim() || !selectedLeadId}
                className="btn btn-primary text-xs w-full mt-2.5 flex items-center justify-center gap-1.5"
              >
                <Send size={13} /> {loading ? 'Analyzing with Intelligence Engine...' : 'Triage Inbound Reply'}
              </button>

              {error && (
                <div className="mt-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-1.5">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Output classification + lead memory */}
        <div className="lead-360-column">
          {result && intentStyle && (
            <div className={`dossier-card mb-4 border-l-4 ${intentStyle.border} ${intentStyle.bg}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Classified Intent
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    <span className={intentStyle.color}>{result.classification}</span>
                  </h3>
                  <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">{result.reasoning}</p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">{intentStyle.consequence}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-500 font-medium block">Re-scored Lead</span>
                  <div className="score-badge-large text-emerald-800 bg-emerald-50 border border-emerald-200 mt-1">
                    <span className="text-2xl font-black">{result.reScoredTotal}</span>
                    <span className="text-xs opacity-75">/100</span>
                  </div>
                  {scoreDelta !== null && (
                    <div
                      className={`text-xs font-semibold mt-1.5 flex items-center justify-end gap-1 ${
                        scoreDelta > 0
                          ? 'text-emerald-700'
                          : scoreDelta < 0
                          ? 'text-rose-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {scoreDelta > 0 ? (
                        <TrendingUp size={12} />
                      ) : scoreDelta < 0 ? (
                        <TrendingDown size={12} />
                      ) : (
                        <Minus size={12} />
                      )}
                      {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} from {previousScore}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="dossier-card">
            <h3 className="section-title">
              <History size={16} className="text-blue-600" />
              Lead Memory Event Stream
            </h3>

            {timeline?.scoreEvolutionNarrative && (
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-blue-900 mt-2.5 mb-3 leading-relaxed">
                <strong className="text-blue-950 font-semibold">Score Evolution Narrative:</strong>{' '}
                {timeline.scoreEvolutionNarrative}
              </div>
            )}

            <div className="timeline-container space-y-3 mt-3">
              {!timeline?.timeline?.length ? (
                <div className="empty-state py-8">
                  <History size={32} className="text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500">
                    No timeline events recorded for this lead yet.
                  </p>
                </div>
              ) : (
                timeline.timeline.map((event: any, idx: number) => (
                  <div key={idx} className="timeline-item">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{event.headline}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{event.detail}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
