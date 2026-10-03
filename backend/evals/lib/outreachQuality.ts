/**
 * Measurable quality checks for generated outreach copy.
 *
 * These replace the previous harness, which asserted a hardcoded
 * `signalGroundingRate = 1.0` and tested a single hand-written sample string
 * for one substring. Both functions here run over real generated text and can
 * fail. They are intentionally conservative: they measure textual grounding,
 * not truth. A message can overlap a signal and still be badly argued — these
 * catch the cheap failure modes (boilerplate, ungrounded claims, unfilled
 * template slots), not every one.
 */

/** Boilerplate openers and filler that signal un-personalised copy. */
export const FLUFF_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'hope-well', pattern: /\bi hope (you('| a)?re|this (email )?finds you)\b/i },
  { id: 'company-growing', pattern: /\byour company is (growing|scaling)\b/i },
  { id: 'reaching-out', pattern: /\bi('m| am) reaching out to (you|see)\b/i },
  { id: 'quick-question-only', pattern: /^\s*quick question\s*[.!?]*\s*$/i },
  { id: 'touch-base', pattern: /\btouch base\b/i },
  { id: 'circle-back-vague', pattern: /\bjust circling back\b/i },
  { id: 'game-changer', pattern: /\b(game[- ]chang(er|ing)|revolutionary|cutting[- ]edge)\b/i },
  { id: 'synergy', pattern: /\b(synerg(y|ies)|leverage our solution)\b/i },
  { id: 'world-class', pattern: /\b(world[- ]class|best[- ]in[- ]class|industry[- ]leading)\b/i },
  { id: 'per-my-last', pattern: /\bper my (last|previous) email\b/i },
];

/** Template slots that were never substituted — always a shipping defect. */
export const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[[A-Za-z_ ]{2,30}\]/, // [First Name], [Company]
  /\{\{[^}]{1,40}\}\}/, // {{company}}
  /\bXYZ\b|\bAcme Corp\b|\bLorem ipsum\b/i,
  /\bundefined\b|\bnull\b|\bNaN\b/,
];

export interface OutreachInspection {
  fluffHits: string[];
  placeholderHits: string[];
  /** True when the copy references at least one supplied signal. */
  grounded: boolean;
  matchedSignalTerms: string[];
  wordCount: number;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'their', 'have',
  'has', 'are', 'was', 'were', 'will', 'into', 'about', 'they', 'you', 'our',
  'its', 'new', 'has', 'had', 'but', 'not', 'all', 'can', 'who', 'how',
  'company', 'companies', 'team', 'teams', 'business', 'inc', 'ltd', 'llc', 'corp',
]);

/** Content words of 4+ chars, lowercased and de-duplicated. */
const contentTerms = (text: string): string[] => {
  const terms = (text.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) || []).filter(
    (t) => !STOPWORDS.has(t)
  );
  return Array.from(new Set(terms));
};

/**
 * Inspects one generated message against the signals it claims to be built on.
 *
 * Grounding is a lexical overlap test: at least one distinctive content term
 * from a supplied signal must appear in the message body. That is a weak but
 * honest proxy — it detects copy that ignores its evidence entirely, which is
 * the failure mode that matters most here.
 */
export const inspectOutreach = (
  message: { subject?: string | null; body: string },
  signals: Array<{ headline?: string | null; detail?: string | null }>
): OutreachInspection => {
  const full = `${message.subject || ''}\n${message.body}`;
  const bodyTerms = new Set(contentTerms(full));

  const matchedSignalTerms: string[] = [];
  for (const signal of signals) {
    const signalText = [signal.headline, signal.detail].filter(Boolean).join(' ');
    for (const term of contentTerms(signalText)) {
      if (bodyTerms.has(term)) matchedSignalTerms.push(term);
    }
  }

  return {
    fluffHits: FLUFF_PATTERNS.filter((f) => f.pattern.test(full)).map((f) => f.id),
    placeholderHits: PLACEHOLDER_PATTERNS.filter((p) => p.test(full)).map((p) => p.source),
    grounded: matchedSignalTerms.length > 0,
    matchedSignalTerms: Array.from(new Set(matchedSignalTerms)),
    wordCount: (message.body.trim().match(/\S+/g) || []).length,
  };
};
