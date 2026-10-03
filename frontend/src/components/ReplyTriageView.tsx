import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { LeadItem } from '../services/api';
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
 * Paste a reply you actually received from a prospect; the backend classifies
 * intent, advances the lead stage, re-scores the lead and appends the event to
 * lead memory. Nothing here is generated or simulated — the reply text is your
 * real inbound message, and every number shown comes back from the server.
 */

const INTENT_STYLES: Record<string, { color: string; bg: string; border: string; consequence: string }> = {
  INTERESTED: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/30',
    border: 'border-l-emerald-500',
    consequence: 'Lead advanced to engaged, score increased, flagged for immediate follow-up.',
  },
  FOLLOW_UP: {
    color: 'text-amber-400',
    bg: 'bg-amber-950/30',
    border: 'border-l-amber-500',
    consequence: 'Lead kept warm with a scheduled re-touch; score modestly adjusted.',
  },
  NOT_INTERESTED: {
    color: 'text-rose-400',
    bg: 'bg-rose-950/30',
    border: 'border-l-rose-500',
    consequence: 'Lead demoted and removed from the active outreach queue.',
  },
  UNSUBSCRIBE: {
    color: 'text-rose-400',
    bg: 'bg-rose-950/30',
    border: 'border-l-rose-500',
    consequence: 'Lead suppressed permanently. No further outreach will be drafted.',
  },
};

export default function ReplyTriageView() {
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
    <div className="response-simulator-page">
      <div className="pipeline-header">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquareQuote className="text-emerald-400" size={26} />
            Reply Triage
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Paste a reply you received. LeadFlow classifies the intent, updates the lead stage,
            re-scores the account and records the event in lead memory.
          </p>
        </div>
      </div>

      <div className="pipeline-grid mt-4">
        {/* Input: who replied, and what they said */}
        <div className="leads-list-column">
          <div className="dossier-card">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Who replied?
            </label>

            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="w-full pl-8 pr-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="Filter by name, company or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* A styled listbox rather than a native <select size>: native
                multi-row selects cannot truncate long rows, scroll awkwardly,
                and look different on every OS. */}
            {leads.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No leads yet. Import leads from the Lead Intelligence tab first.
              </p>
            ) : filteredLeads.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No leads match “{search}”.</p>
            ) : (
              <ul
                role="listbox"
                aria-label="Select the lead who replied"
                className="max-h-64 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800"
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
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                          active ? 'bg-indigo-950/60' : 'bg-slate-900 hover:bg-slate-800/70'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white truncate">{l.fullName}</span>
                          <span className="block text-xs text-slate-400 truncate">
                            {l.companyName}
                            {l.role ? ` · ${l.role}` : ''}
                          </span>
                        </span>
                        <span
                          className={`text-xs font-bold shrink-0 tabular-nums ${
                            l.leadScore === null ? 'text-slate-600' : 'text-emerald-400'
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

            <div className="mt-4 pt-3 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Their reply
              </label>
              <textarea
                rows={8}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono leading-relaxed focus:outline-none focus:border-indigo-500"
                placeholder="Paste the prospect's reply exactly as you received it..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <button
                onClick={handleTriage}
                disabled={loading || !replyText.trim() || !selectedLeadId}
                className="btn btn-primary text-xs w-full mt-2 flex items-center justify-center gap-1.5"
              >
                <Send size={14} /> {loading ? 'Triaging...' : 'Triage reply'}
              </button>

              {error && (
                <div className="mt-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-start gap-1.5">
                  <AlertCircle size={14} className="mt-px shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Output: classification + lead memory */}
        <div className="lead-360-column">
          {result && intentStyle && (
            <div className={`dossier-card mb-4 border-l-4 ${intentStyle.border} ${intentStyle.bg}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Classified intent
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">
                    <span className={intentStyle.color}>{result.classification}</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">{result.reasoning}</p>
                  <p className="text-xs text-slate-400 mt-2 italic">{intentStyle.consequence}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs text-slate-400 block">Re-scored</span>
                  <div className="score-badge-large text-emerald-400 bg-emerald-950/80 border border-emerald-700">
                    <span className="text-2xl font-black">{result.reScoredTotal}</span>
                    <span className="text-xs opacity-75">/100</span>
                  </div>
                  {scoreDelta !== null && (
                    <div
                      className={`text-xs font-semibold mt-1 flex items-center justify-end gap-1 ${
                        scoreDelta > 0
                          ? 'text-emerald-400'
                          : scoreDelta < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
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
              <History size={16} className="text-indigo-400" />
              Lead memory
            </h3>

            {timeline?.scoreEvolutionNarrative && (
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-indigo-200 mt-2 mb-3">
                <strong>Score narrative:</strong> {timeline.scoreEvolutionNarrative}
              </div>
            )}

            <div className="timeline-container space-y-3 mt-3">
              {!timeline?.timeline?.length ? (
                <p className="text-xs text-slate-500">
                  No events recorded for this lead yet.
                </p>
              ) : (
                timeline.timeline.map((event: any, idx: number) => (
                  <div key={idx} className="timeline-item">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{event.headline}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{event.detail}</p>
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
