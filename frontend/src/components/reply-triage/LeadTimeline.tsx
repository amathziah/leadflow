import { Clock3, History, MessageSquareText } from 'lucide-react';
import type { LeadItem } from '../../services/api';
import type { TimelineData } from './types';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
};

const eventLabel = (type: string) => type.replace(/_/g, ' ').toLowerCase();

export default function LeadTimeline({
  lead,
  timeline,
  loading,
  loadError,
  hasResult,
  onRetry,
}: {
  lead: LeadItem | null;
  timeline: TimelineData | null;
  loading: boolean;
  loadError?: string | null;
  hasResult: boolean;
  onRetry?: () => void;
}) {
  const waitingForTimeline = loading || Boolean(lead && timeline?.leadId !== lead.id);

  return (
    <section className="rt-panel rt-timeline-panel" aria-labelledby="rt-timeline-heading">
      <header className="rt-panel-heading">
        <span className="rt-heading-icon"><History size={16} /></span>
        <div><h2 id="rt-timeline-heading">Lead history</h2><p>{lead ? `${lead.fullName || 'Contact'} · ${lead.companyName}` : 'Select a lead to view their history.'}</p></div>
        {timeline && lead && timeline.leadId === lead.id && <span className="rt-count">{timeline.timeline.length}</span>}
      </header>

      {waitingForTimeline ? (
        <div className="rt-empty"><span className="rt-empty-icon"><Clock3 size={17} /></span><strong>Loading lead history</strong><p>Retrieving saved responses, signals, outreach, and score changes.</p></div>
      ) : loadError ? (
        <div className="rt-empty"><span className="rt-empty-icon"><History size={17} /></span><strong>Could not load history</strong><p>{loadError}</p>{onRetry && <button className="btn btn-secondary" type="button" onClick={onRetry}>Retry</button>}</div>
      ) : timeline?.scoreEvolutionNarrative ? (
        <div className="rt-score-narrative"><span>Score history</span><p>{timeline.scoreEvolutionNarrative}</p></div>
      ) : null}

      {!waitingForTimeline && timeline?.timeline?.length ? (
        <ol className="rt-timeline-list">
          {timeline.timeline.map((event, index) => (
            <li className="rt-timeline-event" key={`${event.timestamp}-${index}`}>
              <span className="rt-timeline-marker">{event.type.includes('RESPONSE') ? <MessageSquareText size={14} /> : <History size={14} />}</span>
              <div className="rt-timeline-content">
                <div className="rt-event-heading"><strong>{event.headline}</strong><time dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time></div>
                <span className="rt-event-type">{eventLabel(event.type)}</span>
                <p>{event.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : !waitingForTimeline && !loadError ? (
        <div className="rt-empty">
          <span className="rt-empty-icon"><History size={17} /></span>
          <strong>{!lead ? 'Select a lead' : hasResult ? 'Reply triaged; history is empty' : 'No history recorded'}</strong>
          <p>{!lead ? 'Choose a lead to view their response, outreach, and score history.' : hasResult ? 'The classification result is shown above. No prior events were available for this lead.' : 'Triage a reply or run the lead pipeline to add events to this timeline.'}</p>
        </div>
      ) : null}
    </section>
  );
}
