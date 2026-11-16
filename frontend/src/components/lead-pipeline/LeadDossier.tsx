import AgentRunTrace from '../AgentRunTrace';
import type { Lead360Data } from '../../services/api';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  Building2,
  Cpu,
  Globe2,
  Mail,
  MapPin,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';

type Props = {
  data: Lead360Data;
  processing: boolean;
  pipelineBusy: boolean;
  onRunPipeline: () => void;
  onOpenOutreachReview?: () => void;
};

const externalWebsite = (website: string) => {
  try {
    const url = new URL(website.includes('://') ? website : `https://${website}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const safeSourceUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const painPointText = (point: string | { area?: string; description?: string }, index: number) => {
  if (typeof point === 'string') return point;
  return [point.area || `Insight ${index + 1}`, point.description].filter(Boolean).join(' — ');
};

export default function LeadDossier({ data, processing, pipelineBusy, onRunPipeline, onOpenOutreachReview }: Props) {
  const { lead, score, signals, research, outreach, agentTrace } = data;
  const website = lead.website ? externalWebsite(lead.website) : null;
  const latestDraft = outreach[0];

  return (
    <div className="li-dossier">
      <section className="li-profile-card">
        <div className="li-profile-identity">
          <span className="li-profile-mark"><Building2 size={20} /></span>
          <div className="li-profile-copy">
            <div className="li-profile-eyebrow"><span className="li-kicker">Company profile</span><span className="li-status-pill">{lead.status.replace(/_/g, ' ')}</span></div>
            <h2>{lead.companyName}</h2>
            <p>{lead.fullName || 'Contact not added'}{lead.role ? <><span aria-hidden="true"> · </span>{lead.role}</> : null}</p>
          </div>
        </div>
        <div className="li-profile-actions">
          <div className="li-profile-score">
            <strong>{score.totalScore ?? '—'}</strong><span>/ 100</span>
            <small>{score.formulaVersion ? `Formula ${score.formulaVersion}` : 'Not scored yet'}</small>
          </div>
          <button type="button" className="btn btn-primary li-run-primary" onClick={onRunPipeline} disabled={pipelineBusy}>
            {processing ? <><RefreshCw size={15} className="animate-spin" /> Running pipeline</> : <><Cpu size={15} /> Run pipeline</>}
          </button>
        </div>
        <div className="li-profile-meta">
          {lead.industry && <span>{lead.industry}</span>}
          {lead.country && <span><MapPin size={13} />{lead.country}</span>}
          {lead.employeeCount != null && <span><Users size={13} />{lead.employeeCount.toLocaleString()} employees</span>}
          {lead.fundingStage && <span>{lead.fundingStage}</span>}
          {website && <a href={website} target="_blank" rel="noreferrer"><Globe2 size={13} />{website.replace(/^https?:\/\//, '').replace(/\/$/, '')}<ArrowUpRight size={12} /></a>}
          {lead.email && <a href={`mailto:${lead.email}`}><Mail size={13} />{lead.email}</a>}
        </div>
      </section>

      <AgentRunTrace
        events={agentTrace.events}
        runs={agentTrace.runs}
        qualification={agentTrace.qualification}
        enrichment={agentTrace.enrichment}
        signals={signals}
        research={research}
        score={score}
        outreach={outreach}
      />

      <section className="li-dossier-card">
        <SectionHeading icon={ShieldCheck} title="Score breakdown" description="Understand which factors contributed to the current score." meta={score.explanation?.length ? `${score.explanation.length} factors` : 'Awaiting score'} />
        {score.explanation?.length ? (
          <div className="li-factor-list">
            {score.explanation.map((factor, index) => (
              <article className="li-factor" key={`${factor.factor}-${index}`}>
                <div className="li-factor-top"><strong>{factor.factor}</strong><span>{factor.points} <small>/ {factor.max}</small></span></div>
                <p>{factor.reason}</p>
                <div className="li-factor-track" aria-label={`${factor.factor}: ${factor.points} of ${factor.max}`}>
                  <span style={{ width: `${factor.max ? Math.max(0, Math.min(100, factor.points / factor.max * 100)) : 0}%` }} />
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyInline icon={ShieldCheck} title="Scoring details are not available" detail="Run the pipeline to evaluate and explain this lead's score." onAction={onRunPipeline} actionLabel={processing ? 'Running…' : 'Run pipeline'} disabled={pipelineBusy} />}
      </section>

      <section className="li-dossier-card">
        <SectionHeading icon={Zap} title="Market signals" description="Events recorded for this company, with source details where available." meta={`${signals.length} ${signals.length === 1 ? 'signal' : 'signals'}`} />
        {signals.length ? (
          <div className="li-signal-list">
            {signals.map((signal) => (
              <article className="li-signal" key={signal.id}>
                <div className="li-signal-top"><strong>{signal.headline}</strong><span>{Math.round(signal.confidence * 100)}% confidence</span></div>
                {signal.detail && <p>{signal.detail}</p>}
                <div className="li-signal-meta"><span>{signal.type.replace(/_/g, ' ')}</span><span>{signal.source}</span><time dateTime={signal.detectedAt}>{new Date(signal.detectedAt).toLocaleDateString()}</time>{signal.sourceUrl && safeSourceUrl(signal.sourceUrl) && <a href={safeSourceUrl(signal.sourceUrl)!} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={12} /></a>}</div>
              </article>
            ))}
          </div>
        ) : <EmptyInline icon={Zap} title="No signals recorded" detail="Signals will appear here after the pipeline checks this company." onAction={onRunPipeline} actionLabel={processing ? 'Running…' : 'Run signal research'} disabled={pipelineBusy} />}
      </section>

      <section className="li-dossier-card">
        <SectionHeading icon={Globe2} title="Research dossier" description="Company context synthesized from available profile, signal, and history data." meta={research ? `${Math.round(research.confidenceScore * 100)}% confidence` : 'Not researched'} />
        {research ? (
          <div className="li-research-content">
            <p className="li-research-summary">{research.summary}</p>
            {research.painPoints?.length > 0 && (
              <div className="li-pain-points"><h4>Potential operating priorities</h4><ul>{research.painPoints.map((point, index) => <li key={index}>{painPointText(point, index)}</li>)}</ul></div>
            )}
            {research.qualificationReasons?.length > 0 && (
              <div className="li-pain-points"><h4>Qualification context</h4><ul>{research.qualificationReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>
            )}
            <p className="li-research-footnote">Treat model-synthesized context as a research lead and verify claims against the linked evidence.</p>
          </div>
        ) : <EmptyInline icon={Globe2} title="Research has not been generated" detail="Run the pipeline to collect context and produce a structured company dossier." onAction={onRunPipeline} actionLabel={processing ? 'Running…' : 'Run research'} disabled={pipelineBusy} />}
      </section>

      <section className="li-dossier-card">
        <SectionHeading
          icon={Send}
          title="Outreach draft"
          description="Personalized copy is kept for human review before delivery."
          meta={latestDraft?.state || 'No draft'}
          action={onOpenOutreachReview ? <button type="button" className="li-text-action" onClick={onOpenOutreachReview}>Open review queue <ArrowUpRight size={13} /></button> : undefined}
        />
        {latestDraft ? (
          <div className="li-draft-preview">
            {latestDraft.subject && <h4>{latestDraft.subject}</h4>}
            <p>{latestDraft.body}</p>
            {latestDraft.generation?.generatedBy && <small>Generated by {latestDraft.generation.generatedBy === 'llm' ? 'model' : 'fallback'}{latestDraft.generation.model ? ` · ${latestDraft.generation.model}` : ''}</small>}
          </div>
        ) : <EmptyInline icon={Send} title="No outreach draft yet" detail="Run the pipeline to generate a draft grounded in the research and signals." onAction={onRunPipeline} actionLabel={processing ? 'Running…' : 'Generate outreach'} disabled={pipelineBusy} />}
      </section>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  meta,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  meta: string;
  action?: ReactNode;
}) {
  return (
    <header className="li-section-heading">
      <span className="li-section-icon"><Icon size={16} /></span>
      <div className="li-section-copy"><h3>{title}</h3><p>{description}</p></div>
      {action}
      <span className="li-section-meta">{meta}</span>
    </header>
  );
}

function EmptyInline({
  icon: Icon,
  title,
  detail,
  onAction,
  actionLabel,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  onAction: () => void;
  actionLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="li-inline-empty">
      <span><Icon size={16} /></span><div><strong>{title}</strong><p>{detail}</p></div>
      <button type="button" className="btn btn-secondary" onClick={onAction} disabled={disabled}><Cpu size={14} />{actionLabel}</button>
    </div>
  );
}
