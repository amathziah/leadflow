import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';

/**
 * Single construction point for the Gemini client.
 *
 * There is deliberately no offline/fixture provider here. Every number this
 * system reports — enrichment, signals, dossiers, outreach copy — comes from a
 * real model call against real inputs. If the key is missing we fail loudly at
 * startup rather than quietly substituting invented data, because fabricated
 * output that looks like a result is worse than no result at all.
 */

const PLACEHOLDER_KEYS = new Set([
  '',
  'your-gemini-api-key-here',
  'your_gemini_api_key',
  'changeme',
]);

export const hasUsableGeminiKey = (): boolean => {
  const key = (env.GEMINI_API_KEY || '').trim();
  return key.length > 0 && !PLACEHOLDER_KEYS.has(key.toLowerCase());
};

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'GEMINI_API_KEY is not set (or is still the placeholder from .env.example).\n' +
        'The research, enrichment, signal and personalization stages all require it.\n' +
        'Get a free key at https://aistudio.google.com/apikey and add it to backend/.env:\n' +
        '  GEMINI_API_KEY="AIza..."\n' +
        'Deterministic stages (ICP qualification, scoring, review state machine) run without it.'
    );
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Model selection.
 *
 * These are aliases rather than pinned versions on purpose: this codebase was
 * previously hardcoded to `gemini-2.0-flash`, which Google retired. Every AI
 * stage then failed silently into its deterministic fallback, so the system
 * looked healthy while doing no model work at all. Aliases track the current
 * generation; pin a specific version through the environment when a release
 * needs to be reproducible.
 */
export const MODELS = {
  /** High-volume structured extraction: enrichment, signals, copywriting. */
  fast: process.env.GEMINI_FAST_MODEL || 'gemini-flash-latest',
  /** Multi-step reasoning: deep research and competitive analysis. */
  deep: process.env.GEMINI_DEEP_MODEL || 'gemini-pro-latest',
} as const;

let client: GoogleGenerativeAI | null = null;

/**
 * Returns the shared Gemini client, throwing a actionable error when the key
 * is absent. Callers already wrap model calls in try/catch and degrade to
 * deterministic, evidence-grounded fallbacks.
 */
export const createLlmClient = (): GoogleGenerativeAI => {
  if (!hasUsableGeminiKey()) {
    throw new MissingApiKeyError();
  }
  if (!client) {
    client = new GoogleGenerativeAI(env.GEMINI_API_KEY as string);
  }
  return client;
};
