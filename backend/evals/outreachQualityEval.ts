import { prisma } from '../src/db/prisma.js';
import { PersonalizationService } from '../src/services/personalizationService.js';
import { hasUsableGeminiKey } from '../src/services/ai/llmClient.js';
import { inspectOutreach } from './lib/outreachQuality.js';
import { mean } from './lib/metrics.js';

/**
 * Measures the quality of outreach the system actually generates.
 *
 * This tier needs a database and a real Gemini key, so it cannot run in CI.
 * When prerequisites are missing it reports `skipped` with the reason — it
 * never substitutes a placeholder score. Only companies that already have
 * detected signals are used, because grounding is meaningless without evidence
 * to ground against.
 */

export interface OutreachQualityResult {
  skipped: boolean;
  skipReason?: string;
  sampleSize: number;
  /** Share of drafts that came from the deterministic template, not the model. */
  fallbackRate: number | null;
  /** Quality metrics below cover only genuine model output (`llmSampleSize`). */
  llmSampleSize: number;
  groundingRate: number | null;
  fluffRate: number | null;
  placeholderRate: number | null;
  meanWordCount: number | null;
  generationFailureRate: number | null;
  fallbackReasons: string[];
  findings: Array<{
    company: string;
    generatedBy: 'llm' | 'fallback';
    grounded: boolean;
    matchedTerms: string[];
    fluffHits: string[];
    placeholderHits: string[];
  }>;
}

const skip = (reason: string): OutreachQualityResult => ({
  skipped: true,
  skipReason: reason,
  sampleSize: 0,
  fallbackRate: null,
  llmSampleSize: 0,
  groundingRate: null,
  fluffRate: null,
  placeholderRate: null,
  meanWordCount: null,
  generationFailureRate: null,
  fallbackReasons: [],
  findings: [],
});

export const runOutreachQualityEval = async (limit = 10): Promise<OutreachQualityResult> => {
  if (!hasUsableGeminiKey()) {
    return skip('GEMINI_API_KEY is not configured; outreach generation cannot run.');
  }

  let leads;
  try {
    leads = await prisma.lead.findMany({
      where: { company: { signals: { some: {} } } },
      include: { company: { include: { signals: true } } },
      take: limit,
    });
  } catch (err: any) {
    return skip(`Database unavailable: ${err.message}`);
  }

  if (leads.length === 0) {
    return skip('No leads with detected signals found. Run the pipeline on real leads first.');
  }

  const findings: OutreachQualityResult['findings'] = [];
  const grounded: number[] = [];
  const fluffy: number[] = [];
  const placeheld: number[] = [];
  const wordCounts: number[] = [];
  const usedFallback: number[] = [];
  const fallbackReasons = new Set<string>();
  let failures = 0;

  // Generating a draft persists it. Without cleanup, every eval run would dump
  // real messages into the human review queue — measurement must not mutate the
  // operator's workload.
  const createdMessageIds: string[] = [];

  for (const lead of leads) {
    const signals = lead.company?.signals ?? [];
    try {
      const generated = await PersonalizationService.generateOutreach(lead.id);
      createdMessageIds.push(generated.messageId);
      const inspection = inspectOutreach(
        { subject: generated.subject, body: generated.body },
        signals
      );

      const isFallback = generated.generatedBy === 'fallback';
      usedFallback.push(isFallback ? 1 : 0);
      if (isFallback && generated.fallbackReason) fallbackReasons.add(generated.fallbackReason);

      // Scoring the fallback template would measure a hand-written string, not
      // the system's generation quality — so quality metrics cover model output
      // only. The fallback rate is reported separately and loudly.
      if (!isFallback) {
        grounded.push(inspection.grounded ? 1 : 0);
        fluffy.push(inspection.fluffHits.length > 0 ? 1 : 0);
        placeheld.push(inspection.placeholderHits.length > 0 ? 1 : 0);
        wordCounts.push(inspection.wordCount);
      }

      findings.push({
        company: lead.companyName,
        generatedBy: generated.generatedBy,
        grounded: inspection.grounded,
        matchedTerms: inspection.matchedSignalTerms.slice(0, 6),
        fluffHits: inspection.fluffHits,
        placeholderHits: inspection.placeholderHits,
      });
    } catch {
      // A hard failure is a measured outcome, not something to hide.
      failures++;
    }
  }

  // Remove the drafts this run created, so the review queue is left as found.
  if (createdMessageIds.length > 0) {
    await prisma.outreachMessage
      .deleteMany({ where: { id: { in: createdMessageIds } } })
      .catch(() => {
        /* leaving a draft behind is noisy but not worth failing the eval over */
      });
  }

  const attempted = leads.length;
  return {
    skipped: false,
    sampleSize: findings.length,
    fallbackRate: mean(usedFallback),
    llmSampleSize: grounded.length,
    groundingRate: mean(grounded),
    fluffRate: mean(fluffy),
    placeholderRate: mean(placeheld),
    meanWordCount: mean(wordCounts),
    generationFailureRate: attempted === 0 ? null : failures / attempted,
    fallbackReasons: Array.from(fallbackReasons),
    findings,
  };
};
