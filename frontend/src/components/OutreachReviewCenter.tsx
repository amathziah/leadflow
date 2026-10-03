import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { OutreachMessageItem, ConfigStatus } from '../services/api';
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
} from 'lucide-react';

type Status = { kind: 'info' | 'success' | 'error'; text: string } | null;

/** RFC-4180 quoting so exported copy survives commas, quotes and newlines. */
const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
};

export default function OutreachReviewCenter() {
  const [messages, setMessages] = useState<OutreachMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<OutreachMessageItem | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [actionStatus, setActionStatus] = useState<Status>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);

  const loadPending = async () => {
    try {
      setLoading(true);
      const data = await api.fetchPendingOutreach();
      setMessages(data);
      if (data.length > 0 && !selectedMessage) {
        selectMessage(data[0]);
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
      setActionStatus({ kind: 'success', text: 'Approved. You can now send or copy it.' });
      await loadPending();
    } catch (err: any) {
      setActionStatus({ kind: 'error', text: err.message });
    }
  };

  const handleReject = async () => {
    if (!selectedMessage) return;
    try {
      setActionStatus({ kind: 'info', text: 'Rejecting...' });
      await api.rejectOutreach(selectedMessage.id, reviewerNotes || 'Rejected by reviewer');
      setActionStatus({ kind: 'success', text: 'Rejected.' });
      await loadPending();
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
      setActionStatus({ kind: 'success', text: `Sent to ${to}.` });
      await loadPending();
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

  return (
    <div className="outreach-review-page">
      <div className="pipeline-header">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="text-amber-400" size={26} />
            Human-in-the-Loop Outreach Governance
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Strict Review States: <span className="text-slate-300 font-semibold">DRAFT → REVIEW → APPROVED → SENT</span>. No AI message can be dispatched without human sign-off.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={messages.length === 0}
            className="btn btn-secondary flex items-center gap-2 text-sm"
            title="Download the queue as CSV"
          >
            <Download size={14} /> Export CSV
          </button>
          <button onClick={loadPending} className="btn btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {config && !config.smtp.configured && (
        <div className="mt-3 p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-400 mt-px shrink-0" />
          <div className="text-xs text-amber-200">
            <strong>Email sending is off.</strong> No SMTP server is configured, so LeadFlow will not
            send anything on your behalf. Approve drafts and use <em>Copy</em> or <em>Export CSV</em>{' '}
            to send them yourself. To enable sending, set <code>SMTP_HOST</code>,{' '}
            <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code> and <code>SMTP_FROM</code> in{' '}
            <code>backend/.env</code>.
          </div>
        </div>
      )}

      <div className="pipeline-grid mt-4">
        {/* Left List: Pending Outreach Drafts */}
        <div className="leads-list-column">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Pending Review Queue ({messages.length})</span>
          </div>

          {loading && messages.length === 0 ? (
            <div className="empty-state">
              <RefreshCw size={28} className="animate-spin text-indigo-400 mb-2" />
              <p>Fetching review queue...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 size={36} className="text-emerald-500 mb-2" />
              <h3 className="text-base font-semibold text-slate-300">All caught up!</h3>
              <p className="text-xs text-slate-500 mt-1">
                Zero messages pending human review. Generate new drafts from the Lead Intelligence Pipeline.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isSelected = selectedMessage?.id === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`lead-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectMessage(msg)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-white text-sm truncate">
                        {msg.lead?.fullName || 'Target Lead'}
                      </h4>
                      <p
                        className="text-xs text-indigo-300 mt-0.5 truncate"
                        title={`${msg.lead?.companyName} · ${msg.lead?.role || 'Executive'}`}
                      >
                        {msg.lead?.companyName} · {msg.lead?.role || 'Executive'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {msg.channel === 'EMAIL' ? (
                        <span className="channel-badge text-blue-400"><Mail size={12} /> Email</span>
                      ) : (
                        <span className="channel-badge text-sky-400"><Globe size={12} /> LinkedIn</span>
                      )}
                      <span className={`badge ${msg.state === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                        {msg.state}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 mt-2 font-mono line-clamp-2">
                    {msg.body}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Right Editor: Live Inspection & Approval Terminal */}
        <div className="lead-360-column">
          {!selectedMessage ? (
            <div className="empty-state">
              <FileEdit size={36} className="text-slate-600 mb-2" />
              <p>Select an outreach draft from the queue to inspect and approve.</p>
            </div>
          ) : (
            <div className="dossier-card">
              <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Building2 size={18} className="text-indigo-400" />
                    Review Outreach for {selectedMessage.lead?.fullName}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedMessage.lead?.role} @ {selectedMessage.lead?.companyName} ({selectedMessage.lead?.email || 'No email'})
                  </p>
                </div>

                <div className="text-right">
                  <span className={`badge ${selectedMessage.state === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                    Current State: {selectedMessage.state}
                  </span>
                </div>
              </div>

              {/* Verified Evidence Provenance */}
              <div className="mt-3 p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/50">
                <h4 className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles size={14} /> Signals Grounded in this Outreach:
                </h4>
                <div className="space-y-1 mt-2">
                  {selectedMessage.usedSignals && Array.isArray(selectedMessage.usedSignals) ? (
                    selectedMessage.usedSignals.map((sig: any, idx: number) => (
                      <div key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                        <span className="text-indigo-400">⚡</span>
                        <span>
                          <strong>{sig.headline || sig.signal || 'Signal'}:</strong> {sig.reasoning || sig.evidence || 'Timing verification'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">
                      No signals were recorded for this draft — it is not grounded in verified
                      evidence, so review the claims carefully before sending.
                    </p>
                  )}
                </div>
              </div>

              {/* Subject Editor */}
              <div className="mt-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Email Subject Line:
                </label>
                <input
                  type="text"
                  className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                />
              </div>

              {/* Body Editor */}
              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Message Body (Editable):
                </label>
                <textarea
                  rows={8}
                  className="w-full text-sm p-3 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono leading-relaxed focus:outline-none focus:border-indigo-500"
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                />
              </div>

              {/* Reviewer Notes */}
              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Reviewer Audit Notes:
                </label>
                <input
                  type="text"
                  placeholder="e.g., Verified funding & headcount match; customized second sentence"
                  className="w-full text-xs p-2.5 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200"
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="mt-5 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <button
                    onClick={handleReject}
                    className="btn btn-secondary text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    onClick={handleCopy}
                    className="btn btn-secondary text-xs flex items-center gap-1"
                    title="Copy subject and body to the clipboard"
                  >
                    <Copy size={14} /> Copy
                  </button>
                  <button
                    onClick={handleApprove}
                    className="btn btn-primary text-xs flex items-center gap-1"
                  >
                    <CheckCircle2 size={14} /> Approve Changes
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={Boolean(blockedReason)}
                    className={`btn text-xs flex items-center gap-1 ${
                      blockedReason
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'
                    }`}
                    title={blockedReason || `Send this email to ${selectedMessage.lead?.email}`}
                  >
                    <Send size={14} /> Send email
                  </button>
                </div>

                {blockedReason && (
                  <p className="text-[11px] text-slate-500 mt-2 text-right">{blockedReason}</p>
                )}

                {actionStatus && (
                  <div
                    className={`mt-2 p-2.5 rounded-lg text-xs border ${
                      actionStatus.kind === 'error'
                        ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                        : actionStatus.kind === 'success'
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                        : 'bg-slate-900/60 border-slate-700 text-slate-300'
                    }`}
                  >
                    {actionStatus.text}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
