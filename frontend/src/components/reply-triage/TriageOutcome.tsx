import { ArrowDownRight, ArrowUpRight, Check, Minus, ShieldAlert } from 'lucide-react';
import type { TriageResult } from './types';

const INTENT_LABELS: Record<TriageResult['classification'], { title: string; effect: string }> = {
  INTERESTED: { title: 'Interested', effect: 'Lead marked responded and moved to meeting requested.' },
  FOLLOW_UP: { title: 'Follow up', effect: 'Lead marked responded and moved to objection handling.' },
  NOT_INTERESTED: { title: 'Not interested', effect: 'Lead marked lost and moved to unresponsive.' },
  UNSUBSCRIBE: { title: 'Unsubscribe request', effect: 'Lead marked lost and moved to unresponsive.' },
};

export default function TriageOutcome({ result }: { result: TriageResult }) {
  const intent = INTENT_LABELS[result.classification];
  const delta = result.previousScore === null ? null : result.reScoredTotal - result.previousScore;

  return (
    <section className="rt-panel rt-outcome" aria-labelledby="rt-outcome-title">
      <header className="rt-panel-heading">
        <span className="rt-heading-icon"><Check size={16} /></span>
        <div><h2 id="rt-outcome-title">Triage result</h2><p>Response classified and lead record updated.</p></div>
        <span className="rt-confidence">{Math.round(result.confidence * 100)}% confidence</span>
      </header>

      <div className="rt-outcome-main">
        <div className="rt-intent-block">
          <span className="rt-overline">Classified intent</span>
          <h3>{intent.title}</h3>
          <p>{result.reasoning || 'No additional reasoning was returned.'}</p>
          <div className="rt-state-effect"><ShieldAlert size={14} /><span>{intent.effect}</span><strong className="rt-updated-status">{result.newLeadStatus.replace(/_/g, ' ')}</strong></div>
        </div>
        <div className="rt-score-result">
          <span>Updated score</span>
          <strong>{result.reScoredTotal}<small>/ 100</small></strong>
          {delta !== null ? (
            <span className="rt-score-delta">
              {delta > 0 ? <ArrowUpRight size={14} /> : delta < 0 ? <ArrowDownRight size={14} /> : <Minus size={14} />}
              {delta > 0 ? `+${delta}` : delta} from {result.previousScore}
            </span>
          ) : <span className="rt-score-delta">Previous score unavailable</span>}
        </div>
      </div>
    </section>
  );
}
