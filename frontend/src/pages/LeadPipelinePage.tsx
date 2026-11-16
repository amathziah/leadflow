import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../services/api';
import type { LeadItem, Lead360Data } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import LeadCard from '../components/lead-pipeline/LeadCard';
import LeadDossier from '../components/lead-pipeline/LeadDossier';
import CsvImportDialog from '../components/lead-pipeline/CsvImportDialog';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';

const STATUS_FILTERS = [
  ['ALL', 'All leads'],
  ['CANDIDATE', 'Candidate'],
  ['QUALIFIED', 'Qualified'],
  ['OUTREACH_READY', 'Outreach ready'],
  ['OUTREACH_SENT', 'Outreach sent'],
  ['RESPONDED', 'Responded'],
  ['DISQUALIFIED', 'Disqualified'],
] as const;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function LeadPipelinePage({
  onOpenOutreachReview,
}: {
  onOpenOutreachReview?: () => void;
}) {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [lead360, setLead360] = useState<Lead360Data | null>(null);
  const [settledLead360Id, setSettledLead360Id] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedLeadIdRef = useRef<string | null>(null);
  const statusFilterRef = useRef(statusFilter);
  const appliedSearchRef = useRef(appliedSearch);
  const cancelPipelineRef = useRef<(() => void) | null>(null);

  const activeLeadId = selectedLeadId && leads.some((lead) => lead.id === selectedLeadId)
    ? selectedLeadId
    : leads[0]?.id ?? null;
  const visibleLead360 = lead360?.lead.id === activeLeadId ? lead360 : null;
  const loading360 = Boolean(activeLeadId && settledLead360Id !== activeLeadId);

  useEffect(() => { selectedLeadIdRef.current = activeLeadId; }, [activeLeadId]);
  useEffect(() => {
    statusFilterRef.current = statusFilter;
    appliedSearchRef.current = appliedSearch;
  }, [statusFilter, appliedSearch]);
  useEffect(() => () => cancelPipelineRef.current?.(), []);

  useEffect(() => {
    let cancelled = false;
    const fetchLeads = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.fetchLeads({ status: statusFilter, search: appliedSearch });
        if (!cancelled) setLeads(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load leads.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchLeads();
    return () => { cancelled = true; };
  }, [statusFilter, appliedSearch, reloadKey]);

  useEffect(() => {
    if (!activeLeadId) return;
    let cancelled = false;
    api.fetchLead360(activeLeadId)
      .then((data) => {
        if (!cancelled) {
          setLead360(data);
          setSettledLead360Id(activeLeadId);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLead360(null);
          setSettledLead360Id(activeLeadId);
          setError(err instanceof Error ? err.message : 'Could not load the lead dossier.');
        }
      });
    return () => { cancelled = true; };
  }, [activeLeadId]);

  const refreshLeads = () => setReloadKey((key) => key + 1);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(searchQuery.trim());
  };

  const handleImportCsv = async () => {
    if (!csvText.trim() || importing) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.importCsv(csvText, true);
      if (!result?.success) throw new Error(result?.error || 'CSV import failed.');
      setIsCsvModalOpen(false);
      setCsvText('');
      setNotice(`Import complete. ${result?.data?.createdLeadIds?.length ?? 'New'} lead(s) queued for processing.`);
      refreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleRunPipeline = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);
    selectedLeadIdRef.current = id;
    setSelectedLeadId(id);
    setError(null);
    setNotice(null);
    let cancelled = false;
    cancelPipelineRef.current = () => { cancelled = true; };
    try {
      const queued = await api.runPipeline(id);
      if (!queued?.success || !queued?.data?.jobId) {
        throw new Error(queued?.error || queued?.message || 'The pipeline could not be queued.');
      }
      const jobId = queued.data.jobId as string;
      setNotice('Pipeline queued. Qualification, enrichment, scoring, research, and outreach will appear here as they complete.');
      let finished = false;

      // Keep refreshing the selected lead while this job is active so its trace
      // and the list reflect completed stages without a manual page refresh.
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await wait(1400);
        if (cancelled) break;
        const [latest, latestLeads] = await Promise.all([
          api.fetchLead360(id),
          api.fetchLeads({ status: statusFilterRef.current, search: appliedSearchRef.current }),
        ]);
        if (selectedLeadIdRef.current === id) setLead360(latest);
        setLeads(latestLeads);
        const run = latest.agentTrace.runs.find((item) => item.id === jobId);
        if (run && !['WAITING', 'ACTIVE'].includes(run.status)) {
          finished = true;
          setNotice(run.status === 'COMPLETED' ? 'Pipeline completed successfully.' : `Pipeline finished with status ${run.status}. See the run trace for details.`);
          break;
        }
      }
      if (!cancelled && !finished) setNotice('The pipeline is still running. Refresh the lead trace shortly for the latest stage updates.');
    } catch (err) {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Pipeline could not be run.');
    } finally {
      if (!cancelled) {
        setProcessingId(null);
        cancelPipelineRef.current = null;
      }
    }
  };

  const qualifiedCount = leads.filter((lead) => lead.status === 'QUALIFIED').length;
  const reviewCount = leads.filter((lead) => ['OUTREACH_READY', 'OUTREACH_PENDING_APPROVAL'].includes(lead.status)).length;
  const sentCount = leads.filter((lead) => ['OUTREACH_SENT', 'RESPONDED'].includes(lead.status)).length;

  return (
    <div className="lead-intelligence-page">
      <PageHeader
        eyebrow="Prospecting workspace"
        title="Lead intelligence"
        description="Review account fit, inspect the evidence, and run the research pipeline for each lead."
        icon={Building2}
        actions={(
          <div className="li-header-actions">
            <button type="button" onClick={() => setIsCsvModalOpen(true)} className="btn btn-primary">
              <FileSpreadsheet size={16} /> Import CSV
            </button>
            <button type="button" onClick={refreshLeads} disabled={loading} className="btn btn-secondary li-refresh-button">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        )}
      />

      {(error || notice) && (
        <div className={`li-banner ${error ? 'is-error' : 'is-info'}`} role={error ? 'alert' : 'status'}>
          {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="Dismiss message">×</button>
        </div>
      )}

      <section className="li-metrics" aria-label="Lead summary">
        <Metric icon={Users} label="Leads in view" value={leads.length} />
        <Metric icon={CheckCircle2} label="Qualified" value={qualifiedCount} />
        <Metric icon={Clock3} label="Pending review" value={reviewCount} />
        <Metric icon={Send} label="Dispatched" value={sentCount} />
      </section>

      <section className="li-controls" aria-label="Lead filters">
        <form className="li-search" onSubmit={handleSearch} role="search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search company, contact, or role"
            aria-label="Search leads"
          />
          {searchQuery && (
            <button type="button" className="li-clear-search" onClick={() => { setSearchQuery(''); setAppliedSearch(''); }} aria-label="Clear search">×</button>
          )}
          <button type="submit" className="btn btn-secondary li-search-submit">Search</button>
        </form>
        <div className="li-filter-row" role="group" aria-label="Filter leads by status">
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`li-filter ${statusFilter === value ? 'is-active' : ''}`}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="li-workspace" aria-label="Lead list and details">
        <div className="li-list-panel">
          <header className="li-list-header">
            <div><span className="li-kicker">Accounts</span><h2>Lead list</h2></div>
            <span className="li-count">{loading ? '…' : leads.length}</span>
          </header>
          <div className="li-list-body">
            {loading && leads.length === 0 ? (
              <InlineState icon={RefreshCw} title="Loading leads" detail="Fetching your current pipeline…" loading />
            ) : leads.length === 0 ? (
              <InlineState
                icon={Building2}
                title={appliedSearch || statusFilter !== 'ALL' ? 'No matching leads' : 'Your lead list is empty'}
                detail={appliedSearch || statusFilter !== 'ALL' ? 'Try another search or status filter.' : 'Import a CSV to add companies and contacts to the workspace.'}
                action={!appliedSearch && statusFilter === 'ALL' ? <button type="button" className="btn btn-primary" onClick={() => setIsCsvModalOpen(true)}><FileSpreadsheet size={15} /> Import CSV</button> : undefined}
              />
            ) : (
              leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  selected={activeLeadId === lead.id}
                  processing={processingId === lead.id}
                  disabled={processingId !== null}
                  onSelect={() => setSelectedLeadId(lead.id)}
                  onRun={() => handleRunPipeline(lead.id)}
                />
              ))
            )}
          </div>
        </div>

        <div className="li-detail-panel" aria-live="polite">
          {loading360 ? (
            <InlineState icon={RefreshCw} title="Loading lead dossier" detail="Gathering qualification, score, evidence, and activity." loading />
          ) : visibleLead360 ? (
            <LeadDossier
              data={visibleLead360}
              onRunPipeline={() => activeLeadId && handleRunPipeline(activeLeadId)}
              processing={processingId === activeLeadId}
              pipelineBusy={processingId !== null}
              onOpenOutreachReview={onOpenOutreachReview}
            />
          ) : (
            <InlineState icon={Building2} title="Select a lead" detail="Choose an account from the list to inspect its qualification, score, evidence, and agent activity." />
          )}
        </div>
      </section>

      {isCsvModalOpen && (
        <CsvImportDialog
          value={csvText}
          busy={importing}
          onChange={setCsvText}
          onClose={() => !importing && setIsCsvModalOpen(false)}
          onImport={handleImportCsv}
        />
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <article className="li-metric">
      <span className="li-metric-icon"><Icon size={16} /></span>
      <div><span>{label}</span><strong>{value}</strong></div>
    </article>
  );
}

function InlineState({
  icon: Icon,
  title,
  detail,
  action,
  loading = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="li-state">
      <span className="li-state-icon">{loading ? <Icon className="animate-spin" size={19} /> : <Icon size={19} />}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}
