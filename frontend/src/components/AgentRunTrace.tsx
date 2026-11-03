import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Wrench,
} from 'lucide-react';
import type {
  AgentPipelineRunItem,
  AgentStageTraceItem,
  CompanySignalItem,
  LeadScoreItem,
  OutreachMessageItem,
  ResearchDossierItem,
} from '../services/api';
import Panel from './ui/Panel';

type EnrichmentItem = {
  field: string;
  value: any;
  source: string;
  confidence: number;
  createdAt: string;
};

type Props = {
  events: AgentStageTraceItem[];
  runs: AgentPipelineRunItem[];
  qualification: { timestamp: string; metadata: any } | null;
  enrichment: EnrichmentItem[];
  signals: CompanySignalItem[];
  research: ResearchDossierItem | null;
  score: { scoredAt?: string; explanation: LeadScoreItem[] };
  outreach: OutreachMessageItem[];
};

type StageView = {
  stage: string;
  startedAt?: string;
  finishedAt: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  durationMs?: number;
  details: Record<string, any>;
};

type RunView = {
  id: string;
  attempt: number;
  job?: AgentPipelineRunItem;
  stages: StageView[];
};

const dateTime = (value?: string | null) => {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
};

const safeExternalUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const runViews = (events: AgentStageTraceItem[], jobs: AgentPipelineRunItem[]): RunView[] => {
  const runs = new Map<string, RunView>();

  const byRunAndStage = new Map<string, AgentStageTraceItem[]>();
  for (const event of events) {
    const runId = event.metadata?.runId;
    const stage = event.metadata?.stage;
    if (!runId || !stage) continue;
    const entries = byRunAndStage.get(`${runId}\u0000${stage}`) || [];
    entries.push(event);
    byRunAndStage.set(`${runId}\u0000${stage}`, entries);
  }

  for (const [key, entries] of byRunAndStage) {
    entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const [runId, stage] = key.split('\u0000');
    const [jobId, attemptValue] = runId.split(':');
    const view = runs.get(runId) || {
      id: runId,
      attempt: Number(attemptValue) || 1,
      job: jobs.find((job) => job.id === jobId),
      stages: [],
    };
    const started = entries.find((entry) => entry.metadata.status === 'RUNNING');
    const terminal = [...entries].reverse().find((entry) => entry.metadata.status !== 'RUNNING');
    const last = terminal || entries[entries.length - 1];
    const status = (last.metadata.status || (view.job?.status === 'DLQ' ? 'FAILED' : 'RUNNING')) as StageView['status'];
    view.stages.push({
      stage,
      startedAt: started?.timestamp,
      finishedAt: last.timestamp,
      status,
      durationMs: last.metadata.durationMs,
      details: last.metadata,
    });
    runs.set(runId, view);
  }

  for (const job of jobs) {
    if (![...runs.keys()].some((runId) => runId === job.id || runId.startsWith(`${job.id}:`))) {
      runs.set(job.id, { id: job.id, attempt: job.attempts, job, stages: [] });
    }
  }

  return [...runs.values()].sort((a, b) => {
    const aTime = a.job?.createdAt || a.stages[0]?.startedAt || '';
    const bTime = b.job?.createdAt || b.stages[0]?.startedAt || '';
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
};

function StageDetails({ stage, details }: { stage: string; details: Record<string, any> }) {
  if (stage === 'ICP qualification' && details.checks) {
    return (
      <ul className="agent-trace-checks">
        {Object.entries(details.checks).map(([key, check]: [string, any]) => (
          <li key={key}>
            <span className="agent-trace-check-state">{check.passed ? 'Passed' : 'Failed'}</span>
            <span><strong>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c: string) => c.toUpperCase())}</strong><small>{check.reason}</small></span>
          </li>
        ))}
      </ul>
    );
  }

  if (stage === 'Company enrichment' && Array.isArray(details.fieldsUpdated)) {
    return details.fieldsUpdated.length ? (
      <ul className="agent-trace-detail-list">
        {details.fieldsUpdated.map((item: any, index: number) => (
          <li key={`${item.field}-${index}`}><strong>{item.field}</strong><span>{item.source}</span></li>
        ))}
      </ul>
    ) : <p className="agent-trace-muted">
      {details.generatedBy === 'not_needed'
        ? 'Imported profile already contained the fields used by qualification.'
        : details.generatedBy === 'fallback'
        ? 'No enrichment fields were saved because the lookup fell back.'
        : 'No missing company fields were returned by enrichment.'}
    </p>;
  }

  if (stage === 'Lead scoring' && Array.isArray(details.explanation)) {
    return (
      <ul className="agent-trace-detail-list">
        {details.explanation.map((item: LeadScoreItem, index: number) => (
          <li key={`${item.factor}-${index}`}><strong>{item.factor}: {item.points}/{item.max}</strong><span>{item.reason}</span></li>
        ))}
      </ul>
    );
  }

  if (stage === 'Research synthesis' && Array.isArray(details.tools)) {
    return <div className="agent-trace-tool-list">{details.tools.map((tool: string) => <span key={tool}><Wrench size={12} />{tool}</span>)}</div>;
  }

  if (stage === 'Outreach drafting' && Array.isArray(details.usedSignals) && details.usedSignals.length) {
    return (
      <ul className="agent-trace-detail-list">
        {details.usedSignals.map((signal: any, index: number) => (
          <li key={`${signal.signalId || signal.headline}-${index}`}><strong>{signal.headline}</strong><span>{signal.reasoning}</span></li>
        ))}
      </ul>
    );
  }

  if (stage === 'Market signal detection') {
    return <p className="agent-trace-muted">{details.signalCount ?? 0} signal(s) recorded. Source citations are listed below.</p>;
  }

  return null;
}

export default function AgentRunTrace({ events, runs, qualification, enrichment, signals, research, score, outreach }: Props) {
  const history = runViews(events, runs);
  const researchMeta = research?.toolOutputs?._agentRun;
  const latestOutreach = outreach[0];
  const outreachGeneration = latestOutreach?.generation;
  const toolOutputs = research?.toolOutputs;
  const toolNames = toolOutputs && typeof toolOutputs === 'object'
    ? Object.keys(toolOutputs).filter((key) => key !== '_agentRun')
    : [];
  const toolFallbacks = toolNames.flatMap((tool) => {
    const provenance = toolOutputs?.[tool]?._agent;
    return provenance?.generatedBy === 'fallback'
      ? [{ tool, reason: provenance.fallbackReason || 'Tool returned a fallback result.' }]
      : [];
  });

  return (
    <Panel className="agent-trace-panel">
      <div className="agent-trace-heading">
        <div className="lead-intel-panel-title">
          <span className="lead-intel-panel-icon"><Activity size={16} /></span>
          <div><h3>Agent run trace</h3><p>Stages, evidence, tool outputs, and recovery details for this lead.</p></div>
        </div>
        <span className="lead-intel-count">{history.length} run{history.length === 1 ? '' : 's'}</span>
      </div>

      {history.length ? (
        <div className="agent-trace-runs">
          {history.map((run, index) => (
            <details className="agent-trace-run" key={run.id} open={index === 0}>
              <summary>
                <span><strong>{index === 0 ? 'Latest pipeline run' : 'Pipeline run'}</strong><small>Attempt {run.attempt} · {dateTime(run.job?.createdAt || run.stages[0]?.startedAt)}</small></span>
                <span className="agent-trace-job-state">{run.job?.status || (run.stages.some((stage) => stage.status === 'FAILED') ? 'FAILED' : 'RECORDED')}</span>
              </summary>
              <ol className="agent-trace-timeline">
                {run.stages.map((stage, stageIndex) => (
                  <li className="agent-trace-stage" key={`${stage.stage}-${stageIndex}`}>
                    <span className="agent-trace-stage-icon">
                      {stage.status === 'COMPLETED' ? <CheckCircle2 size={15} /> : stage.status === 'FAILED' ? <AlertCircle size={15} /> : <Clock3 size={15} />}
                    </span>
                    <div className="agent-trace-stage-content">
                      <div className="agent-trace-stage-topline">
                        <strong>{stage.stage}</strong>
                        <span>{stage.status === 'COMPLETED' ? 'Completed' : stage.status === 'FAILED' ? 'Failed' : 'In progress'}</span>
                      </div>
                      <small>
                        {stage.startedAt ? `Started ${dateTime(stage.startedAt)}` : `Updated ${dateTime(stage.finishedAt)}`}
                        {stage.status !== 'RUNNING' ? ` · Ended ${dateTime(stage.finishedAt)}` : ''}
                        {stage.durationMs !== undefined ? ` · ${stage.durationMs} ms` : ''}
                      </small>
                      <StageDetails stage={stage.stage} details={stage.details} />
                      {stage.details.generatedBy && (
                        <p className="agent-trace-provenance">
                          {stage.details.generatedBy === 'llm' ? 'Model generated' : stage.details.generatedBy === 'fallback' ? 'Fallback used' : 'No model call required'}
                          {stage.details.model ? ` · ${stage.details.model}` : ''}
                        </p>
                      )}
                      {stage.details.fallbackReason && <p className="agent-trace-fallback">Fallback: {stage.details.fallbackReason}</p>}
                      {stage.details.error && <p className="agent-trace-fallback">Failure: {stage.details.error}</p>}
                    </div>
                  </li>
                ))}
                {run.job?.lastError && !run.stages.some((stage) => stage.status === 'FAILED') && (
                  <li className="agent-trace-job-error"><AlertCircle size={14} /><span>Queue error: {run.job.lastError}</span></li>
                )}
              </ol>
            </details>
          ))}
        </div>
      ) : (
        <div className="agent-trace-empty"><Clock3 size={16} /><span>No recorded pipeline run yet. Run the pipeline to capture each stage as it executes.</span></div>
      )}

      <div className="agent-trace-evidence-grid">
        <section className="agent-trace-evidence">
          <h4>Signals and source evidence <span>{signals.length}</span></h4>
          {signals.length ? signals.slice(0, 5).map((signal) => {
            const href = safeExternalUrl(signal.sourceUrl);
            return (
              <article key={signal.id}>
                <strong>{signal.headline}</strong>
                <p>{signal.detail || 'No additional evidence detail recorded.'}</p>
                <small>{signal.source} · {Math.round(signal.confidence * 100)}% confidence · {dateTime(signal.detectedAt)}</small>
                {href && <a href={href} target="_blank" rel="noreferrer">Open source <ExternalLink size={12} /></a>}
              </article>
            );
          }) : <p className="agent-trace-muted">No market signals are currently recorded.</p>}
        </section>

        <section className="agent-trace-evidence">
          <h4>Research tools <span>{toolNames.length}</span></h4>
          {toolNames.length ? (
            <>
              <div className="agent-trace-tool-list">{toolNames.map((tool) => <span key={tool}><Wrench size={12} />{tool}</span>)}</div>
              {toolFallbacks.map(({ tool, reason }) => <p className="agent-trace-fallback" key={tool}>{tool} fallback: {reason}</p>)}
              <details className="agent-trace-raw-tools">
                <summary>Inspect collected tool context</summary>
                {toolNames.map((tool) => (
                  <div key={tool}><strong>{tool.replace(/_/g, ' ')}</strong><pre>{JSON.stringify(toolOutputs[tool], null, 2)}</pre></div>
                ))}
              </details>
            </>
          ) : <p className="agent-trace-muted">Research tool outputs are not available yet.</p>}
          {research?.generatedAt && <small className="agent-trace-time">Research saved {dateTime(research.generatedAt)} · {research.agentVersion || 'agent version unavailable'}{research.generatedBy ? ` · ${research.generatedBy === 'fallback' ? 'fallback' : 'model generated'}` : ''}</small>}
          {researchMeta?.fallbackReason && <p className="agent-trace-fallback">Research fallback: {researchMeta.fallbackReason}</p>}
        </section>

        <section className="agent-trace-evidence">
          <h4>Qualification checks <span>{qualification || events.some((event) => event.metadata.stage === 'ICP qualification') ? 'Recorded' : '—'}</span></h4>
          {(() => {
            const latestCheckEvent = events.find((event) => event.metadata.stage === 'ICP qualification' && event.metadata.status === 'COMPLETED');
            const checks = qualification?.metadata?.checks || latestCheckEvent?.metadata.checks;
            return checks ? (
              <ul className="agent-trace-checks">
                {Object.entries(checks).map(([key, check]: [string, any]) => (
                  <li key={key}><span className="agent-trace-check-state">{check.passed ? 'Passed' : 'Failed'}</span><span><strong>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c: string) => c.toUpperCase())}</strong><small>{check.reason}</small></span></li>
                ))}
              </ul>
            ) : <p className="agent-trace-muted">Qualification checks appear after a lead has been evaluated against an ICP.</p>;
          })()}
        </section>

        <section className="agent-trace-evidence">
          <h4>Enrichment and outreach <span>{enrichment.length + outreach.length}</span></h4>
          {enrichment.length ? (
            <ul className="agent-trace-detail-list">
              {enrichment.slice(0, 8).map((item, index) => <li key={`${item.field}-${index}`}><strong>{item.field}</strong><span>{item.source} · {Math.round(item.confidence * 100)}% · {dateTime(item.createdAt)}</span></li>)}
            </ul>
          ) : <p className="agent-trace-muted">No enrichment records are available.</p>}
          {latestOutreach && (
            <div className="agent-trace-outreach-meta">
              <strong>Latest draft · {latestOutreach.state}</strong>
              <small>{dateTime(latestOutreach.createdAt)}{latestOutreach.generation?.generatedBy ? ` · ${latestOutreach.generation.generatedBy}` : ''}</small>
              {outreachGeneration?.fallbackReason && <p className="agent-trace-fallback">Draft fallback: {outreachGeneration.fallbackReason}</p>}
            </div>
          )}
          {score.scoredAt && <small className="agent-trace-time">Score calculated {dateTime(score.scoredAt)}</small>}
        </section>
      </div>
    </Panel>
  );
}
