import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { LeadItem } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import ReplyLeadPicker from '../components/reply-triage/ReplyLeadPicker';
import ReplyComposer from '../components/reply-triage/ReplyComposer';
import TriageOutcome from '../components/reply-triage/TriageOutcome';
import LeadTimeline from '../components/reply-triage/LeadTimeline';
import type { TimelineData, TriageResult } from '../components/reply-triage/types';
import { AlertCircle, MessageSquareQuote } from 'lucide-react';

export default function ReplyTriagePage() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [search, setSearch] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [timelineLoadedFor, setTimelineLoadedFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leadLoadAttempt, setLeadLoadAttempt] = useState(0);
  const [timelineLoadAttempt, setTimelineLoadAttempt] = useState(0);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const loadingTimeline = Boolean(selectedLeadId && timelineLoadedFor !== selectedLeadId);

  useEffect(() => {
    let cancelled = false;
    api.fetchLeads()
      .then((data) => {
        if (!cancelled) {
          setLeads(data);
          setSelectedLeadId((current) => current || data[0]?.id || '');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load leads.';
          setLeadsError(message);
          setError(message);
        }
      })
      .finally(() => { if (!cancelled) setLoadingLeads(false); });
    return () => { cancelled = true; };
  }, [leadLoadAttempt]);

  useEffect(() => {
    if (!selectedLeadId) return;
    let cancelled = false;
    api.fetchLeadTimeline(selectedLeadId)
      .then((data) => {
        if (!cancelled) {
          setTimeline(data);
          setTimelineError(null);
          setTimelineLoadedFor(selectedLeadId);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTimeline(null);
          const message = err instanceof Error ? err.message : 'Could not load lead history.';
          setTimelineError(message);
          setError(message);
          setTimelineLoadedFor(selectedLeadId);
        }
      });
    return () => { cancelled = true; };
  }, [selectedLeadId, timelineLoadAttempt]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return leads;
    return leads.filter((lead) =>
      [lead.fullName, lead.companyName, lead.role, lead.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [leads, search]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || null;
  const replyText = replyDrafts[selectedLeadId] || '';

  const handleSelectLead = (id: string) => {
    if (id === selectedLeadId) return;
    setSelectedLeadId(id);
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoadedFor(null);
    setResult(null);
    setError(null);
  };

  const handleTriage = async () => {
    if (!selectedLeadId || !replyText.trim() || submitting) return;
    const leadId = selectedLeadId;
    const previousScore = selectedLead?.leadScore ?? null;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.submitResponse(leadId, replyText.trim());
      const data = response?.data ?? response;
      setResult({ ...data, previousScore });
      setReplyDrafts((drafts) => ({ ...drafts, [leadId]: '' }));
      setTimelineLoadedFor(null);
      const [leadRefresh, timelineRefresh] = await Promise.allSettled([
        api.fetchLeads(),
        api.fetchLeadTimeline(leadId),
      ]);
      if (leadRefresh.status === 'fulfilled') setLeads(leadRefresh.value);
      else setError('Reply was triaged, but the lead list could not be refreshed.');
      if (selectedLeadId === leadId) {
        if (timelineRefresh.status === 'fulfilled') {
          setTimeline(timelineRefresh.value);
          setTimelineError(null);
        } else {
          setTimeline(null);
          setTimelineError('Lead history could not be refreshed.');
          setError('Reply was triaged, but lead history could not be refreshed.');
        }
        setTimelineLoadedFor(leadId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Triage failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="reply-triage-page rt-page">
      <PageHeader
        eyebrow="Response intelligence"
        title="Reply triage"
        description="Classify an inbound reply, update the lead, and review the resulting score and history."
        icon={MessageSquareQuote}
      />

      {error && <div className="rt-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button></div>}

      <div className="rt-workspace">
        <aside className="rt-input-column" aria-label="Select lead and submit reply">
          <ReplyLeadPicker
            leads={filteredLeads}
            selectedLeadId={selectedLeadId}
            search={search}
            loading={loadingLeads}
            loadError={leadsError}
            disabled={submitting}
            onSearch={setSearch}
            onSelect={handleSelectLead}
            onRetry={() => {
              setError(null);
              setLeadsError(null);
              setLoadingLeads(true);
              setLeadLoadAttempt((attempt) => attempt + 1);
            }}
          />
          <ReplyComposer
            lead={selectedLead}
            value={replyText}
            submitting={submitting}
            disabled={!selectedLeadId || !replyText.trim()}
            onChange={(value) => setReplyDrafts((drafts) => ({ ...drafts, [selectedLeadId]: value }))}
            onSubmit={handleTriage}
          />
        </aside>

        <section className="rt-results-column" aria-label="Triage results and lead history">
          {result && <TriageOutcome result={result} />}
          <LeadTimeline
            lead={selectedLead}
            timeline={timeline}
            loading={loadingTimeline || loadingLeads}
            loadError={timelineError}
            hasResult={Boolean(result)}
            onRetry={() => {
              setError(null);
              setTimelineError(null);
              setTimelineLoadedFor(null);
              setTimelineLoadAttempt((attempt) => attempt + 1);
            }}
          />
        </section>
      </div>
    </div>
  );
}
