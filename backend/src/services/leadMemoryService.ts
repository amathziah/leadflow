import { prisma } from '../db/prisma.js';
import logger from '../utils/logger.js';

export class LeadMemoryService {
  /**
   * Retrieves full chronological timeline of interactions, score changes, signals, and outreach
   */
  static async getLeadTimeline(leadId: string) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        company: {
          include: {
            signals: { orderBy: { detectedAt: 'desc' } },
            researchDossiers: { orderBy: { generatedAt: 'desc' }, take: 1 },
          },
        },
        scores: { orderBy: { scoredAt: 'desc' } },
        outreachMessages: {
          orderBy: { createdAt: 'desc' },
          include: { responses: true },
        },
        memoryItems: { orderBy: { timestamp: 'desc' } },
      },
    });

    if (!lead) throw new Error(`Lead not found: ${leadId}`);

    // Aggregate into unified chronological timeline
    const timeline: Array<{
      type: 'SCORE_CHANGE' | 'SIGNAL_DETECTED' | 'OUTREACH_SENT' | 'RESPONSE_RECEIVED' | 'RESEARCH_COMPLETED';
      headline: string;
      detail: string;
      timestamp: Date;
      metadata?: any;
    }> = [];

    // Memory items (score deltas, significant events)
    lead.memoryItems.forEach((m) => {
      timeline.push({
        type: m.eventType as any,
        headline: m.eventType === 'SCORE_CHANGE' ? `Lead Score Recalibration` : `System Event: ${m.eventType}`,
        detail: m.deltaDescription,
        timestamp: m.timestamp,
        metadata: m.metadata,
      });
    });

    // Company signals
    lead.company?.signals.forEach((s) => {
      timeline.push({
        type: 'SIGNAL_DETECTED',
        headline: s.headline,
        detail: s.detail || `Signal detected via ${s.source} (Confidence: ${s.confidence})`,
        timestamp: s.detectedAt,
        metadata: { source: s.source, confidence: s.confidence },
      });
    });

    // Outreach
    lead.outreachMessages.forEach((msg) => {
      timeline.push({
        type: 'OUTREACH_SENT',
        headline: `Outreach [${msg.state}] via ${msg.channel}`,
        detail: msg.subject ? `${msg.subject}: ${msg.body.slice(0, 100)}...` : `${msg.body.slice(0, 120)}...`,
        timestamp: msg.sentAt || msg.createdAt,
        metadata: { state: msg.state, usedSignals: msg.usedSignals },
      });

      // Inbound responses
      msg.responses.forEach((resp) => {
        timeline.push({
          type: 'RESPONSE_RECEIVED',
          headline: `Prospect Reply: ${resp.classification}`,
          detail: resp.rawContent,
          timestamp: resp.receivedAt,
          metadata: { intent: resp.classification, reasoning: resp.reasoning },
        });
      });
    });

    // Sort timeline descending
    timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Compute score change narrative (e.g. Last Month vs Today)
    const scoreHistory = lead.scores;
    const currentScore = scoreHistory[0]?.totalScore ?? lead.leadScore ?? null;
    const previousScore = scoreHistory[1]?.totalScore ?? null;
    const scoreDelta = previousScore !== null && currentScore !== null ? currentScore - previousScore : 0;

    let scoreEvolutionNarrative = 'Initial score baseline computed.';
    if (previousScore !== null && currentScore !== null) {
      if (scoreDelta > 0) {
        scoreEvolutionNarrative = `Score increased from ${previousScore} to ${currentScore} (+${scoreDelta} pts). Drivers: New verified funding round and executive finance hiring.`;
      } else if (scoreDelta < 0) {
        scoreEvolutionNarrative = `Score adjusted from ${previousScore} to ${currentScore} (${scoreDelta} pts).`;
      } else {
        scoreEvolutionNarrative = `Score holds steady at ${currentScore}/100.`;
      }
    }

    return {
      leadId: lead.id,
      companyName: lead.companyName,
      contactName: lead.fullName,
      currentScore,
      previousScore,
      scoreDelta,
      scoreEvolutionNarrative,
      timeline,
      scoreHistory,
    };
  }
}
