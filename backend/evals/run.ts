import fs from 'fs';
import path from 'path';
import { runQualificationEval } from './qualificationEval.js';
import { runOutreachQualityEval } from './outreachQualityEval.js';
import { QUALIFICATION_CASES, EVAL_ICP } from './datasets/qualification.js';
import { num, pct } from './lib/metrics.js';

/**
 * Evaluation entry point.
 *
 * Tier 1 (qualification) is pure and always runs — no DB, no network, no key.
 * Tier 2 (outreach quality) needs a database and a real API key, and reports
 * itself as skipped when those are absent rather than emitting a stand-in
 * number. The process exits non-zero when Tier 1 regresses, so CI fails loudly.
 */

const REPORT_PATH = path.join(process.cwd(), 'evals', 'REPORT.md');

// Tier 1 is deterministic, so anything below a clean sweep is a regression.
const QUALIFICATION_F1_FLOOR = 1.0;

const main = async () => {
  console.log('LeadFlow evaluation suite');
  console.log('='.repeat(60));

  // --- Tier 1 -------------------------------------------------------------
  console.log('\n[Tier 1] Deterministic ICP qualification (no DB, no API key)');
  const qualification = runQualificationEval();
  const q = qualification.metrics;

  console.log(`  cases      : ${q.total}`);
  console.log(`  accuracy   : ${pct(q.accuracy)}`);
  console.log(`  precision  : ${pct(q.precision)}`);
  console.log(`  recall     : ${pct(q.recall)}`);
  console.log(`  F1         : ${num(q.f1)}`);
  console.log(
    `  confusion  : TP=${q.confusion.truePositives} TN=${q.confusion.trueNegatives} ` +
      `FP=${q.confusion.falsePositives} FN=${q.confusion.falseNegatives}`
  );
  console.log(
    `  latency    : p50=${num(qualification.latencyMs.p50, 4)}ms ` +
      `p90=${num(qualification.latencyMs.p90, 4)}ms p99=${num(qualification.latencyMs.p99, 4)}ms`
  );

  if (qualification.failures.length > 0) {
    console.log(`\n  ${qualification.failures.length} failing case(s):`);
    for (const f of qualification.failures) {
      console.log(`   - ${f.id}: expected ${f.expected}, got ${f.actual}`);
      console.log(`     ${f.rationale}`);
      console.log(`     engine said: ${f.reasons.join('; ')}`);
    }
  }

  // --- Tier 2 -------------------------------------------------------------
  console.log('\n[Tier 2] Generated outreach quality (needs DB + GEMINI_API_KEY)');
  const outreach = await runOutreachQualityEval();

  if (outreach.skipped) {
    console.log(`  SKIPPED: ${outreach.skipReason}`);
  } else {
    console.log(`  drafts produced    : ${outreach.sampleSize}`);
    console.log(`  deterministic fallback: ${pct(outreach.fallbackRate)}`);
    if (outreach.fallbackReasons.length > 0) {
      for (const reason of outreach.fallbackReasons) {
        console.log(`    ! ${reason.slice(0, 160)}`);
      }
    }
    console.log(`  --- model output only (n=${outreach.llmSampleSize}) ---`);
    console.log(`  signal grounding   : ${pct(outreach.groundingRate)}`);
    console.log(`  fluff rate         : ${pct(outreach.fluffRate)}`);
    console.log(`  placeholder leak   : ${pct(outreach.placeholderRate)}`);
    console.log(`  hard failures      : ${pct(outreach.generationFailureRate)}`);
    console.log(`  mean word count    : ${num(outreach.meanWordCount, 1)}`);
  }

  writeReport(qualification, outreach);
  console.log(`\nReport written to ${path.relative(process.cwd(), REPORT_PATH)}`);

  const f1 = q.f1 ?? 0;
  if (f1 < QUALIFICATION_F1_FLOOR) {
    console.error(
      `\nFAIL: qualification F1 ${num(f1)} is below the ${QUALIFICATION_F1_FLOOR} floor.`
    );
    process.exit(1);
  }
  console.log('\nPASS');
};

const writeReport = (
  qualification: ReturnType<typeof runQualificationEval>,
  outreach: Awaited<ReturnType<typeof runOutreachQualityEval>>
) => {
  const q = qualification.metrics;
  const adversarial = QUALIFICATION_CASES.filter((c) => c.id.startsWith('adv-')).length;

  const lines = [
    '# LeadFlow — Evaluation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Every number below is computed at run time by `npm run evals`. Metrics that',
    'could not be measured are reported as `n/a` or `skipped`, never estimated.',
    '',
    '## Tier 1 — Deterministic ICP qualification',
    '',
    'Pure function, no database, no network, no API key. Runs in CI on every push.',
    '',
    `- Dataset: ${QUALIFICATION_CASES.length} hand-labelled cases (${adversarial} adversarial)`,
    `- ICP under test: ${EVAL_ICP.name}`,
    '',
    '| Metric | Value |',
    '| :--- | :--- |',
    `| Cases | ${q.total} |`,
    `| Accuracy | ${pct(q.accuracy)} |`,
    `| Precision | ${pct(q.precision)} |`,
    `| Recall | ${pct(q.recall)} |`,
    `| F1 | ${num(q.f1)} |`,
    `| True / false positives | ${q.confusion.truePositives} / ${q.confusion.falsePositives} |`,
    `| True / false negatives | ${q.confusion.trueNegatives} / ${q.confusion.falseNegatives} |`,
    `| Latency p50 / p90 / p99 | ${num(qualification.latencyMs.p50, 4)}ms / ${num(qualification.latencyMs.p90, 4)}ms / ${num(qualification.latencyMs.p99, 4)}ms |`,
    '',
    qualification.failures.length === 0
      ? '_No failing cases._'
      : [
          `### ${qualification.failures.length} failing case(s)`,
          '',
          ...qualification.failures.flatMap((f) => [
            `- **${f.id}** — expected \`${f.expected}\`, got \`${f.actual}\``,
            `  - ${f.rationale}`,
            `  - Engine reasoning: ${f.reasons.join('; ')}`,
          ]),
        ].join('\n'),
    '',
    '## Tier 2 — Generated outreach quality',
    '',
    'Requires a database with signal-bearing leads and a real `GEMINI_API_KEY`.',
    '',
    outreach.skipped
      ? `**Skipped.** ${outreach.skipReason}`
      : [
          '| Metric | Value |',
          '| :--- | :--- |',
          `| Drafts produced | ${outreach.sampleSize} |`,
          `| Fell back to deterministic template | ${pct(outreach.fallbackRate)} |`,
          `| Hard failures | ${pct(outreach.generationFailureRate)} |`,
          '',
          `Quality metrics below cover genuine model output only (n=${outreach.llmSampleSize}).`,
          'Scoring the fallback template would measure a hand-written string rather',
          'than the system generating anything.',
          '',
          '| Metric | Value |',
          '| :--- | :--- |',
          `| Signal grounding rate | ${pct(outreach.groundingRate)} |`,
          `| Fluff rate | ${pct(outreach.fluffRate)} |`,
          `| Placeholder leak rate | ${pct(outreach.placeholderRate)} |`,
          `| Mean word count | ${num(outreach.meanWordCount, 1)} |`,
          outreach.fallbackReasons.length > 0
            ? `\n**Fallback causes observed:**\n${outreach.fallbackReasons.map((r) => `- ${r}`).join('\n')}`
            : '',
        ].join('\n'),
    '',
    '## Methodology and limitations',
    '',
    '- **Labels are human judgements.** Tier 1 labels say what a careful reviewer',
    '  would decide for the pinned ICP, not what the implementation returns. The',
    '  suite is meant to be able to fail — on its first run it surfaced four',
    '  precision defects (substring industry matching, substring role matching,',
    '  and blank country/role auto-passing), taking precision from 0.64 to 1.00.',
    '- **Small dataset.** Tier 1 is a few dozen author-written cases. It guards',
    '  against regressions in rules this codebase owns; it is not a claim about',
    '  real-world lead quality.',
    '- **Grounding is lexical.** Tier 2 checks that generated copy reuses',
    '  distinctive terms from the signals it was given. That detects copy which',
    '  ignores its evidence; it does not verify the claims are true.',
    '- **No model-quality claim.** None of these numbers measure the underlying',
    '  LLM. They measure this system: its rules, its prompts, its plumbing.',
    '',
  ];

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
};

main()
  .catch((err) => {
    console.error('Evaluation suite crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/db/prisma.js');
    await prisma.$disconnect().catch(() => {});
  });
