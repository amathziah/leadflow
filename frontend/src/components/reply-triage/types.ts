export type TriageIntent = 'INTERESTED' | 'FOLLOW_UP' | 'NOT_INTERESTED' | 'UNSUBSCRIBE';

export type TriageResult = {
  classification: TriageIntent;
  confidence: number;
  reasoning: string;
  leadId: string;
  newLeadStatus: string;
  reScoredTotal: number;
  previousScore: number | null;
};

export type TimelineEvent = {
  type: string;
  headline: string;
  detail: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type TimelineData = {
  leadId: string;
  currentScore: number | null;
  previousScore: number | null;
  scoreDelta: number;
  scoreEvolutionNarrative: string;
  timeline: TimelineEvent[];
};
