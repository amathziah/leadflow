# LeadFlow — Evaluation Report

Generated: 2026-10-02T20:39:58.805Z

Every number below is computed at run time by `npm run evals`. Metrics that
could not be measured are reported as `n/a` or `skipped`, never estimated.

## Tier 1 — Deterministic ICP qualification

Pure function, no database, no network, no API key. Runs in CI on every push.

- Dataset: 20 hand-labelled cases (5 adversarial)
- ICP under test: Mid-market B2B software, English-speaking markets

| Metric | Value |
| :--- | :--- |
| Cases | 20 |
| Accuracy | 100.0% |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 1.000 |
| True / false positives | 9 / 0 |
| True / false negatives | 11 / 0 |
| Latency p50 / p90 / p99 | 0.0223ms / 0.1397ms / 0.2265ms |

_No failing cases._

## Tier 2 — Generated outreach quality

Requires a database with signal-bearing leads and a real `GEMINI_API_KEY`.

| Metric | Value |
| :--- | :--- |
| Drafts produced | 4 |
| Fell back to deterministic template | 0.0% |
| Hard failures | 0.0% |

Quality metrics below cover genuine model output only (n=4).
Scoring the fallback template would measure a hand-written string rather
than the system generating anything.

| Metric | Value |
| :--- | :--- |
| Signal grounding rate | 100.0% |
| Fluff rate | 0.0% |
| Placeholder leak rate | 0.0% |
| Mean word count | 95.5 |


## Methodology and limitations

- **Labels are human judgements.** Tier 1 labels say what a careful reviewer
  would decide for the pinned ICP, not what the implementation returns. The
  suite is meant to be able to fail — on its first run it surfaced four
  precision defects (substring industry matching, substring role matching,
  and blank country/role auto-passing), taking precision from 0.64 to 1.00.
- **Small dataset.** Tier 1 is a few dozen author-written cases. It guards
  against regressions in rules this codebase owns; it is not a claim about
  real-world lead quality.
- **Grounding is lexical.** Tier 2 checks that generated copy reuses
  distinctive terms from the signals it was given. That detects copy which
  ignores its evidence; it does not verify the claims are true.
- **No model-quality claim.** None of these numbers measure the underlying
  LLM. They measure this system: its rules, its prompts, its plumbing.
