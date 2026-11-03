import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { OutreachMessageItem, ConfigStatus } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import {
  ShieldAlert,
  CheckCircle2,
  Send,
  XCircle,
  FileEdit,
  Sparkles,
  RefreshCw,
  Building2,
  Mail,
  Globe,
  Copy,
  Download,
  AlertTriangle,
  Zap,
} from 'lucide-react';

type Status = { kind: 'info' | 'success' | 'error'; text: string } | null;

/** RFC-4180 quoting so exported copy survives commas, quotes and newlines. */
const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Recently created';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently created' : date.toLocaleString();
};

export default function OutreachReviewPage() {
  const [messages, setMessages] = useState<OutreachMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<OutreachMessageItem | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [actionStatus, setActionStatus] = useState<Status>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);

  const loadPending = async (preserveSelection = false) => {
    try {
      setLoading(true);
      const data = await api.fetchPendingOutreach();
      setMessages(data);
      if (preserveSelection && selectedMessage) return;
      if (selectedMessage && data.some((message) => message.id === selectedMessage.id)) {
        return;
      }
      if (data.length > 0) {
        selectMessage(data[0]);
      } else {
        setSelectedMessage(null);
        setEditedSubject('');
        setEditedBody('');
        setReviewerNotes('');
      }
    } catch (err: any) {
      setActionStatus({ kind: 'error', text: err.message || 'Failed to load the review queue.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
    api.fetchConfigStatus().then(setConfig).catch(() => setConfig(null));
  }, []);

  const selectMessage = (msg: OutreachMessageItem) => {
    setSelectedMessage(msg);
    setEditedSubject(msg.subject || '');
    setEditedBody(msg.body);
    setReviewerNotes('');
    setActionStatus(null);
  };

  const handleApprove = async () => {
    if (!selectedMessage) return;
    try {
      setActionStatus({ kind: 'info', text: 'Approving...' });
      await api.approveOutreach(selectedMessage.id, reviewerNotes, editedSubject, editedBody);
      setSelectedMessage({ ...selectedMessage, state: 'APPROVED', subject: editedSubject, body: editedBody });
      await loadPending(true);
      setActionStatus({ kind: 'success', text: 'Approved. You can now send or copy it.' });
    } catch (err: any) {
      setActionStatus({ kind: 'error', text: err.message });
    }
  };

  const handleReject = async () => {
    if (!selectedMessage) return;
    try {
      setActionStatus({ kind: 'info', text: 'Rejecting...' });
      await api.rejectOutreach(selectedMessage.id, reviewerNotes || 'Rejected by reviewer');
      await loadPending();
      setActionStatus({ kind: 'success', text: 'Rejected.' });
    } catch (err: any) {
      setActionStatus({ kind: 'error', text: err.message });
    }
  };

  /**
   * Sends for real over SMTP. The server only advances the message to SENT
   * once the mail server has accepted it, so a failure here means nothing was
   * delivered and the draft stays APPROVED.
   */
  const handleSend = async () => {
    if (!selectedMessage) return;
    const to = selectedMessage.lead?.email;
    if (!window.confirm(`Send this email to ${to}? This delivers a real message.`)) return;
    try {
      setActionStatus({ kind: 'info', text: `Sending to ${to}...` });
      await api.dispatchOutreach(selectedMessage.id);
      await loadPending();
      setActionStatus({ kind: 'success', text: `Sent to ${to}.` });
    } catch (err: any) {
      setActionStatus({ kind: 'error', text: `Not sent — ${err.message}` });
    }
  };

  /** Manual path: works regardless of whether SMTP is set up. */
  const handleCopy = async () => {
    if (!selectedMessage) return;
    const text = editedSubject ? `Subject: ${editedSubject}\n\n${editedBody}` : editedBody;
    try {
      await navigator.clipboard.writeText(text);
      setActionStatus({ kind: 'success', text: 'Copied to clipboard.' });
    } catch {
      setActionStatus({ kind: 'error', text: 'Clipboard blocked by the browser. Select the text manually.' });
    }
  };

  /** Exports the whole queue so it can be worked in a mail merge or CRM. */
  const handleExportCsv = () => {
    if (messages.length === 0) return;
    const header = ['Name', 'Email', 'Company', 'Role', 'Channel', 'State', 'Subject', 'Body'];
    const rows = messages.map((m) =>
      [
        m.lead?.fullName,
        m.lead?.email,
        m.lead?.companyName,
        m.lead?.role,
        m.channel,
        m.state,
        m.subject,
        m.body,
      ]
        .map(csvCell)
        .join(',')
    );
    const blob = new Blob([[header.map(csvCell).join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadflow-outreach-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setActionStatus({ kind: 'success', text: `Exported ${messages.length} message(s).` });
  };

  // Why sending may be unavailable — shown to the user instead of a dead button.
  const sendBlockedReason = (): string | null => {
    if (!selectedMessage) return 'No message selected.';
    if (selectedMessage.state !== 'APPROVED') return 'Approve the message before sending.';
    if (selectedMessage.channel !== 'EMAIL')
      return 'Automated sending supports email only — use Copy for LinkedIn.';
    if (!selectedMessage.lead?.email) return 'This lead has no email address on record.';
    if (config && !config.smtp.configured) return 'SMTP is not configured — use Copy or Export instead.';
    return null;
  };
  const blockedReason = sendBlockedReason();
  const actionBusy = actionStatus?.kind === 'info';

  return (
    <div className="outreach-review-page">
      <PageHeader
        eyebrow="Governance gate"
        title="Outreach review"
        description={<>Review drafts before delivery. Every message moves through <strong>Draft → Review → Approved → Sent</strong>.</>}
        icon={ShieldAlert}
        actions={<div className="or-header-actions">
          <button
            onClick={handleExportCsv}
            disabled={messages.length === 0}
            className="btn btn-secondary or-header-button"
            title="Download the queue as CSV"
          >
            <Download size={15} /> Export queue
          </button>
          <button onClick={() => loadPending()} className="btn btn-secondary or-header-button" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh queue
          </button>
        </div>}
      />

      {config && !config.smtp.configured && (
        <div className="or-manual-notice" role="status">
          <AlertTriangle size={17} />
          <div>
            <strong>Email is in manual mode</strong>
            <p>No SMTP server is configured. Approved drafts can still be copied or exported and sent through your mail client or CRM.</p>
            <details>
              <summary>Configure live delivery</summary>
              <p>Set <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code>, and <code>SMTP_FROM</code> in <code>backend/.env</code>.</p>
            </details>
          </div>
        </div>
      )}

      {actionStatus && (
        <div className={`or-feedback ${actionStatus.kind}`} role={actionStatus.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
          {actionStatus.kind === 'error' ? <AlertTriangle size={16} /> : actionStatus.kind === 'success' ? <CheckCircle2 size={16} /> : <RefreshCw size={16} className="animate-spin" />}
          <span>{actionStatus.text}</span>
        </div>
      )}

      <div className="or-workspace">
        <section className="or-queue" aria-labelledby="or-queue-title">
          <header className="or-section-header">
            <div>
              <p className="or-overline">Human approval</p>
              <h2 id="or-queue-title">Review queue</h2>
            </div>
            <span className="or-count">{messages.length}</span>
          </header>
          {selectedMessage?.state === 'APPROVED' && !messages.some((message) => message.id === selectedMessage.id) && (
            <div className="or-approved-note">Approved draft is open in the editor for delivery.</div>
          )}
          <div className="or-queue-list">
            {loading && messages.length === 0 ? (
              <div className="or-queue-state">
                <RefreshCw size={18} className="animate-spin" />
                <span>Loading review queue…</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="or-queue-empty">
                <CheckCircle2 size={22} />
                <strong>No drafts pending review</strong>
                <p>New drafts will appear here after the lead pipeline generates them.</p>
              </div>
            ) : messages.map((message) => {
              const isSelected = selectedMessage?.id === message.id;
              return (
                <button
                  key={message.id}
                  type="button"
                  className={`or-queue-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectMessage(message)}
                  disabled={actionBusy}
                  aria-pressed={isSelected}
                  aria-label={`Review ${message.lead?.fullName || 'Target Lead'} at ${message.lead?.companyName || 'unknown company'}`}
                >
                  <span className="or-item-topline">
                    <span className="or-person-name">{message.lead?.fullName || 'Target Lead'}</span>
                    <span className={`or-state ${message.state.toLowerCase()}`}>{message.state}</span>
                  </span>
                  <span className="or-company-line">
                    {message.lead?.companyName || 'Company unavailable'}
                    {message.lead?.role ? ` · ${message.lead.role}` : ''}
                  </span>
                  <span className="or-item-meta">
                    <span>{message.channel === 'EMAIL' ? <Mail size={13} /> : <Globe size={13} />}{message.channel === 'EMAIL' ? 'Email' : 'LinkedIn'}</span>
                    <span>{formatDate(message.createdAt)}</span>
                  </span>
                  <span className="or-item-subject">{message.subject || 'No subject line'}</span>
                  <span className="or-item-preview">{message.body}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="or-editor" aria-labelledby="or-editor-title">
          {!selectedMessage ? (
            <div className="or-editor-empty">
              <span className="or-empty-icon"><FileEdit size={20} /></span>
              <h2 id="or-editor-title">Select a draft to review</h2>
              <p>Choose a message from the queue to inspect its evidence, edit the copy, and record your decision.</p>
            </div>
          ) : (
            <>
              <header className="or-editor-header">
                <div className="or-editor-identity">
                  <span className="or-company-icon"><Building2 size={18} /></span>
                  <div className="or-identity-copy">
                    <p className="or-overline">{selectedMessage.channel === 'EMAIL' ? 'Email draft' : 'LinkedIn draft'}</p>
                    <h2 id="or-editor-title">{selectedMessage.lead?.companyName || 'Company unavailable'}</h2>
                    <p>{selectedMessage.lead?.fullName || 'Target Lead'}{selectedMessage.lead?.role ? ` · ${selectedMessage.lead.role}` : ''}</p>
                  </div>
                </div>
                <span className={`or-state or-state-large ${selectedMessage.state.toLowerCase()}`}>{selectedMessage.state}</span>
              </header>

              <div className="or-editor-body">
                <section className="or-evidence" aria-labelledby="or-evidence-title">
                  <div className="or-evidence-heading">
                    <span className="or-evidence-icon"><Sparkles size={15} /></span>
                    <div>
                      <h3 id="or-evidence-title">Evidence used in this draft</h3>
                      <p>Review the signals behind the message before approving its claims.</p>
                    </div>
                  </div>
                  {Array.isArray(selectedMessage.usedSignals) && selectedMessage.usedSignals.length > 0 ? (
                    <ul className="or-signal-list">
                      {selectedMessage.usedSignals.map((signal: any, index: number) => (
                        <li key={signal.signalId || `${signal.headline || signal.signal}-${index}`}>
                          <Zap size={14} />
                          <p><strong>{signal.headline || signal.signal || 'Market signal'}</strong><span>{signal.reasoning || signal.evidence || 'No additional reasoning recorded.'}</span></p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="or-no-evidence">No market signals were attached to this draft. Review any timing or company-specific claims carefully.</p>
                  )}
                </section>

                <div className="or-form-grid">
                  <div className="or-field">
                    <label htmlFor="or-subject">Subject line</label>
                    <input
                      id="or-subject"
                      type="text"
                      className="form-input"
                      disabled={actionBusy}
                      value={editedSubject}
                      onChange={(event) => setEditedSubject(event.target.value)}
                    />
                  </div>
                  <div className="or-field">
                    <label htmlFor="or-body">Message body</label>
                    <textarea
                      id="or-body"
                      rows={10}
                      className="form-textarea"
                      disabled={actionBusy}
                      value={editedBody}
                      onChange={(event) => setEditedBody(event.target.value)}
                    />
                    <span className="or-field-hint">Edits are saved when you approve the draft.</span>
                  </div>
                  <div className="or-field">
                    <label htmlFor="or-notes">Reviewer notes <span>Optional</span></label>
                    <input
                      id="or-notes"
                      type="text"
                      placeholder="Record evidence checks or changes made"
                      className="form-input"
                      disabled={actionBusy}
                      value={reviewerNotes}
                      onChange={(event) => setReviewerNotes(event.target.value)}
                    />
                  </div>
                </div>

                <footer className="or-action-footer">
                  <div className="or-action-copy">
                    <strong>Review decision</strong>
                    <span>{blockedReason || 'Check the message and evidence before taking action.'}</span>
                  </div>
                  <div className="or-actions">
                    <button onClick={handleReject} disabled={actionBusy} className="btn btn-secondary or-action-button">
                      <XCircle size={15} /> Reject
                    </button>
                    <button onClick={handleCopy} disabled={actionBusy} className="btn btn-secondary or-action-button" title="Copy the edited subject and body">
                      <Copy size={15} /> Copy
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={actionBusy || selectedMessage.state === 'APPROVED'}
                      className={`btn ${selectedMessage.state === 'APPROVED' ? 'btn-secondary' : 'btn-primary'} or-action-button`}
                    >
                      <CheckCircle2 size={15} /> {selectedMessage.state === 'APPROVED' ? 'Approved' : 'Approve changes'}
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={Boolean(blockedReason) || actionBusy}
                      className={`btn ${!blockedReason ? 'btn-primary' : 'btn-secondary'} or-action-button`}
                      title={blockedReason || `Send this email to ${selectedMessage.lead?.email}`}
                    >
                      <Send size={15} /> {selectedMessage.channel === 'EMAIL' ? 'Send email' : 'Email unavailable'}
                    </button>
                  </div>
                </footer>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
