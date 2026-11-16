import { Building2, Search, Users } from 'lucide-react';
import type { LeadItem } from '../../services/api';

type Props = {
  leads: LeadItem[];
  selectedLeadId: string;
  search: string;
  loading: boolean;
  loadError?: string | null;
  disabled?: boolean;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onRetry?: () => void;
};

export default function ReplyLeadPicker({ leads, selectedLeadId, search, loading, loadError, disabled = false, onSearch, onSelect, onRetry }: Props) {
  return (
    <section className="rt-panel rt-lead-panel" aria-labelledby="rt-lead-heading">
      <header className="rt-panel-heading">
        <span className="rt-heading-icon"><Users size={16} /></span>
        <div><h2 id="rt-lead-heading">Responding lead</h2><p>Select who sent the reply.</p></div>
        <span className="rt-count">{loading ? '…' : leads.length}</span>
      </header>

      <div className="rt-search">
        <Search size={15} aria-hidden="true" />
        <input aria-label="Search contacts, companies, email, or role" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search contacts, companies, email, or role" disabled={disabled} />
        {search && <button type="button" onClick={() => onSearch('')} aria-label="Clear lead search" disabled={disabled}>×</button>}
      </div>

      {loading ? (
        <div className="rt-empty"><span className="rt-empty-icon"><Users size={17} /></span><strong>Loading leads</strong><p>Your workspace contacts will appear here.</p></div>
      ) : loadError ? (
        <div className="rt-empty"><span className="rt-empty-icon"><Users size={17} /></span><strong>Could not load leads</strong><p>{loadError}</p>{onRetry && <button className="btn btn-secondary" type="button" onClick={onRetry}>Retry</button>}</div>
      ) : leads.length ? (
        <ul className="rt-lead-list" aria-label="Available leads">
          {leads.map((lead) => {
            const selected = lead.id === selectedLeadId;
            return (
              <li key={lead.id}>
                <button type="button" aria-pressed={selected} className={`rt-lead-option ${selected ? 'is-selected' : ''}`} onClick={() => onSelect(lead.id)} disabled={disabled}>
                  <span className="rt-company-mark">{lead.companyName?.slice(0, 2).toUpperCase() || <Building2 size={15} />}</span>
                  <span className="rt-lead-copy">
                    <strong>{lead.fullName || 'Contact not added'}</strong>
                    <span>{lead.companyName}</span>
                    {lead.role && <small>{lead.role}</small>}
                  </span>
                  <span className="rt-lead-score" aria-label={lead.leadScore === null ? 'Unscored' : `Score ${lead.leadScore}`}>
                    {lead.leadScore ?? '—'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rt-empty"><span className="rt-empty-icon"><Building2 size={17} /></span><strong>{search ? 'No leads match that search' : 'No leads available'}</strong><p>{search ? 'Try another name, company, email, or role.' : 'Import leads from Lead Intelligence to triage a reply.'}</p></div>
      )}
    </section>
  );
}
