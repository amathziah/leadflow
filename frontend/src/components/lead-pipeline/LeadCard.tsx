import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  Cpu,
  MapPin,
  RefreshCw,
  Send,
  Users,
  Zap,
} from 'lucide-react';
import type { LeadItem } from '../../services/api';

type Props = {
  lead: LeadItem;
  selected: boolean;
  processing: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRun: () => void;
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'QUALIFIED': return 'Qualified';
    case 'DISQUALIFIED': return 'Disqualified';
    case 'OUTREACH_READY':
    case 'OUTREACH_PENDING_APPROVAL': return 'Review ready';
    case 'OUTREACH_SENT': return 'Dispatched';
    case 'RESPONDED': return 'Responded';
    case 'CONVERTED': return 'Converted';
    case 'LOST': return 'Closed';
    default: return 'Candidate';
  }
};

const scoreLabel = (score: number | null) => score === null ? 'Unscored' : `${score} / 100`;

export default function LeadCard({ lead, selected, processing, disabled, onSelect, onRun }: Props) {
  const signalCount = lead.company?.signals?.length || 0;

  return (
    <article className={`li-lead-card ${selected ? 'is-selected' : ''}`}>
      <button
        type="button"
        className="li-card-select"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Open ${lead.companyName}${lead.fullName ? `, ${lead.fullName}` : ''}`}
      >
        <span className="li-company-mark" aria-hidden="true">
          {lead.companyName?.slice(0, 2).toUpperCase() || <Building2 size={16} />}
        </span>
        <span className="li-card-main">
          <span className="li-card-title-line">
            <strong title={lead.companyName}>{lead.companyName}</strong>
            <span className={`li-score ${lead.leadScore === null ? 'is-empty' : ''}`}>{scoreLabel(lead.leadScore)}</span>
          </span>
          <span className="li-card-contact">
            {lead.fullName || 'Contact not added'}{lead.role ? <><span aria-hidden="true"> · </span>{lead.role}</> : null}
          </span>
          <span className="li-card-meta">
            {lead.industry && <span>{lead.industry}</span>}
            {lead.company?.country && <span><MapPin size={12} />{lead.company.country}</span>}
            {lead.company?.employeeCount != null && <span><Users size={12} />{lead.company.employeeCount.toLocaleString()}</span>}
            {lead.company?.fundingStage && <span>{lead.company.fundingStage}</span>}
          </span>
        </span>
        <ArrowUpRight className="li-card-open" size={15} aria-hidden="true" />
      </button>
      <div className="li-card-footer">
        <div className="li-card-tags">
          <span className="li-status-pill">
            {['QUALIFIED', 'CONVERTED'].includes(lead.status) ? <CheckCircle2 size={13} /> :
              ['OUTREACH_READY', 'OUTREACH_PENDING_APPROVAL'].includes(lead.status) ? <Clock3 size={13} /> :
                lead.status === 'OUTREACH_SENT' || lead.status === 'RESPONDED' ? <Send size={13} /> : null}
            {statusLabel(lead.status)}
          </span>
          {signalCount > 0 && <span className="li-signal-count"><Zap size={13} />{signalCount} signal{signalCount === 1 ? '' : 's'}</span>}
        </div>
        <div className="li-card-footer-bottom">
          {lead.company?.signals?.[0] ? (
            <span className="li-card-signal" title={lead.company.signals[0].headline}>
              <Zap size={13} />{lead.company.signals[0].headline}
            </span>
          ) : <span className="li-card-no-signal">No market signals yet</span>}
          <button type="button" className="li-run-button" onClick={onRun} disabled={disabled}>
            {processing ? <RefreshCw size={14} className="animate-spin" /> : <Cpu size={14} />}
            {processing ? 'Running' : 'Run pipeline'}
          </button>
        </div>
      </div>
    </article>
  );
}
