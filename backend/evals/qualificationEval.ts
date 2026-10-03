import { QualificationService } from '../src/services/qualificationService.js';
import { EVAL_ICP, QUALIFICATION_CASES, type QualificationCase } from './datasets/qualification.js';
import {
  classificationMetrics,
  emptyConfusion,
  percentile,
  recordOutcome,
  type ClassificationMetrics,
} from './lib/metrics.js';

/**
 * Evaluates deterministic ICP qualification against human-labelled ground truth.
 *
 * Runs entirely in-process: no database, no network, no API key. That is what
 * lets it run on every CI push, and it is only possible because
 * `QualificationService.qualify` is a pure function.
 */

export interface QualificationFailure {
  id: string;
  rationale: string;
  expected: boolean;
  actual: boolean;
  reasons: string[];
}

export interface QualificationEvalResult {
  metrics: ClassificationMetrics;
  latencyMs: { p50: number | null; p90: number | null; p99: number | null };
  failures: QualificationFailure[];
}

export const runQualificationEval = (
  cases: QualificationCase[] = QUALIFICATION_CASES
): QualificationEvalResult => {
  const confusion = emptyConfusion();
  const latencies: number[] = [];
  const failures: QualificationFailure[] = [];

  for (const testCase of cases) {
    const start = performance.now();
    const result = QualificationService.qualify(testCase.company, testCase.lead, EVAL_ICP);
    latencies.push(performance.now() - start);

    recordOutcome(confusion, result.isQualified, testCase.expectedQualified);

    if (result.isQualified !== testCase.expectedQualified) {
      failures.push({
        id: testCase.id,
        rationale: testCase.rationale,
        expected: testCase.expectedQualified,
        actual: result.isQualified,
        reasons: result.isQualified ? result.reasons : result.disqualificationReasons,
      });
    }
  }

  return {
    metrics: classificationMetrics(confusion),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p90: percentile(latencies, 0.9),
      p99: percentile(latencies, 0.99),
    },
    failures,
  };
};
