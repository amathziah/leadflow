# Postmortem: every model call failed for weeks, and the system reported healthy

**Status:** resolved
**Severity:** high — total loss of AI functionality, zero alerts
**Detection:** found while building the evaluation suite, not by monitoring

---

## Summary

Every call to the language model in LeadFlow had been failing with HTTP 404.
Enrichment, signal detection, research synthesis and outreach copywriting were
all affected — the entire model-assisted half of the pipeline.

Nothing alerted. The API returned `200 OK` on every request, drafts kept
appearing in the review queue, the logs showed success lines, and the dashboard
showed healthy numbers. The system looked completely fine while doing no model
work at all.

## Impact

- 100% of model-generated content was silently replaced by deterministic templates.
- The first evaluation run reported **100% signal grounding and 0% boilerplate** —
  excellent-looking numbers that were measuring hand-written fallback strings,
  not model output.
- Severity is bounded only because the fallbacks were themselves grounded in real
  signals, so the output was mediocre rather than wrong.

## Root cause

Model IDs were hardcoded as pinned versions:

```js
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
```

Google retired `gemini-2.0-flash`. Every request began returning:

```
[404 Not Found] This model is no longer available.
```

A pinned dependency on someone else's deprecation schedule is a time bomb with
no alarm attached.

## Why it stayed invisible

The root cause was a one-line fix. The interesting failure is the detection gap,
and it had three layers.

**1. Fallbacks swallowed the error.** Every service wrapped its model call in
try/catch and degraded to a deterministic template — correct behaviour in
isolation. But the caller received a well-formed result with no indication it was
a degraded one, so a total outage was indistinguishable from normal operation.

**2. Logs recorded the symptom and buried it.** Each failure logged at `warn`,
then the next line logged success at `info`. Nothing aggregated warn rates, so
the signal existed and no one was counting it.

**3. The evaluation suite measured the fallback.** This is the part worth
sitting with. The suite was built to catch quality regressions, and it gave the
system a perfect score *because* the system was broken — it scored a fixed
hand-written string, which by construction contains no boilerplate and reuses
its input signals. **A metric that cannot distinguish a working system from a
broken one is not a metric.**

## Resolution

**Make degradation visible in the data, not just the logs.** Generation now
reports its own provenance:

```ts
export interface GeneratedOutreach {
  generatedBy: 'llm' | 'fallback';
  fallbackReason?: string;
}
```

A degraded run can no longer be mistaken for a healthy one by the UI, the
evaluation suite, or a human reading the output.

**Measure the fallback rate as a first-class metric.** Tier 2 of the suite now
reports fallback rate separately and computes quality over model output only.
Scoring a template measures a string I wrote, not a system generating anything.

**Stop pinning to a deprecation schedule.** Model IDs moved behind
env-overridable aliases (`gemini-flash-latest`), so a retirement degrades
gracefully instead of silently. An exact version can still be pinned when a
release needs reproducibility — the default just isn't a time bomb.

## What I took from it

- **A fallback without provenance is a lie the system tells itself.** Graceful
  degradation is correct; graceful degradation that is indistinguishable from
  success is a bug, and a worse one than crashing.
- **Evaluation suites need a failure they are known to catch.** If I had asked
  "what would this suite report if the model were entirely absent?", the answer
  — a perfect score — would have exposed the gap immediately.
- **Perfect scores deserve suspicion.** 100% grounding and 0% fluff on the first
  run should have prompted a check that the metric could ever fail, not
  satisfaction.

## Open follow-ups

- Alert on fallback rate crossing a threshold, rather than relying on a human
  reading the eval report.
- A startup healthcheck that makes one real model call and fails loudly, so the
  deploy surfaces the problem instead of the next evaluation run.
