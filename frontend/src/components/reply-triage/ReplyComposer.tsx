import type { FormEvent } from 'react';
import { LoaderCircle, MessageSquareText, Send } from 'lucide-react';
import type { LeadItem } from '../../services/api';

type Props = {
  lead: LeadItem | null;
  value: string;
  submitting: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export default function ReplyComposer({ lead, value, submitting, disabled, onChange, onSubmit }: Props) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="rt-panel rt-composer" onSubmit={handleSubmit}>
      <header className="rt-panel-heading">
        <span className="rt-heading-icon"><MessageSquareText size={16} /></span>
        <div><h2>Inbound reply</h2><p>Paste the prospect’s message as received.</p></div>
      </header>

      {lead ? (
        <div className="rt-selected-context"><span>Reply for</span><strong>{lead.fullName || 'Contact not added'}</strong><small>{lead.companyName}{lead.role ? ` · ${lead.role}` : ''}</small></div>
      ) : (
        <div className="rt-select-prompt">Choose a lead above to attach this reply to their record.</div>
      )}

      <label className="rt-field-label" htmlFor="rt-reply-content">Reply text</label>
      <textarea
        id="rt-reply-content"
        rows={7}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste the complete email or message…"
        disabled={!lead || submitting}
      />
      <div className="rt-composer-footer">
        <span>{value.length.toLocaleString()} characters</span>
        <button type="submit" className="btn btn-primary" disabled={disabled || submitting}>
          {submitting ? <><LoaderCircle size={15} className="animate-spin" /> Analyzing reply…</> : <><Send size={15} /> Classify reply</>}
        </button>
      </div>
    </form>
  );
}
