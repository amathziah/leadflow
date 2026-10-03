/**
 * Metric primitives for the evaluation suite.
 *
 * Every value here is computed from observed outcomes. Nothing in this file
 * returns a constant — if a metric cannot be computed from the data (an empty
 * denominator, a tier that did not run) it returns `null` and the reporter
 * renders it as "n/a" rather than inventing a number.
 */

export interface ConfusionMatrix {
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
}

export const emptyConfusion = (): ConfusionMatrix => ({
  truePositives: 0,
  trueNegatives: 0,
  falsePositives: 0,
  falseNegatives: 0,
});

export const recordOutcome = (
  m: ConfusionMatrix,
  predicted: boolean,
  actual: boolean
): ConfusionMatrix => {
  if (predicted && actual) m.truePositives++;
  else if (!predicted && !actual) m.trueNegatives++;
  else if (predicted && !actual) m.falsePositives++;
  else m.falseNegatives++;
  return m;
};

/** Ratio helper: `null` when the denominator is zero, never a silent 0 or 1. */
const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

export interface ClassificationMetrics {
  total: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  confusion: ConfusionMatrix;
}

export const classificationMetrics = (c: ConfusionMatrix): ClassificationMetrics => {
  const total = c.truePositives + c.trueNegatives + c.falsePositives + c.falseNegatives;
  const precision = ratio(c.truePositives, c.truePositives + c.falsePositives);
  const recall = ratio(c.truePositives, c.truePositives + c.falseNegatives);

  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  return {
    total,
    accuracy: ratio(c.truePositives + c.trueNegatives, total),
    precision,
    recall,
    f1,
    confusion: c,
  };
};

/**
 * Nearest-rank percentile on a copy of the input.
 *
 * The previous harness indexed with `floor(len * p)`, which runs off the end of
 * the array at p=1.0 and reports `undefined`; this clamps instead.
 */
export const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
};

export const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/** Formats a 0..1 proportion as a percentage, or "n/a" when unmeasured. */
export const pct = (value: number | null, digits = 1): string =>
  value === null ? 'n/a' : `${(value * 100).toFixed(digits)}%`;

export const num = (value: number | null, digits = 3): string =>
  value === null ? 'n/a' : value.toFixed(digits);
