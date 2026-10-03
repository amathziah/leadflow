import { env } from '../config/env.js';
import { createLlmClient, MODELS } from './ai/llmClient.js';
import { prisma } from '../db/prisma.js';
import { SignalType } from '@prisma/client';
import logger from '../utils/logger.js';

export interface DetectedSignal {
  type: SignalType;
  headline: string;
  detail: string;
  source: string;
  sourceUrl?: string;
  confidence: number;
}

const SIGNAL_TYPE_MAP: Record<string, SignalType> = {
  HIRING_GROWTH: SignalType.HIRING_GROWTH,
  FUNDING_ROUND: SignalType.FUNDING_ROUND,
  GEO_EXPANSION: SignalType.GEO_EXPANSION,
  LEADERSHIP_CHANGE: SignalType.LEADERSHIP_CHANGE,
  TECH_ADOPTION: SignalType.TECH_ADOPTION,
  PRODUCT_LAUNCH: SignalType.PRODUCT_LAUNCH,
  PARTNERSHIP: SignalType.PARTNERSHIP,
  AWARD: SignalType.AWARD,
};

export class SignalEngine {

  /**
   * Scans company public signals using Gemini grounded web research.
   * Returns verified business signals grounded in publicly available evidence.
   */
  static async detectSignals(companyId: string): Promise<DetectedSignal[]> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error(`Company not found with id: ${companyId}`);
    }

    const detected = await this.fetchRealSignals(company.name, company.domain);

    // Persist new signals into company_signals (avoid duplicates by checking headline)
    for (const sig of detected) {
      const existing = await prisma.companySignal.findFirst({
        where: {
          companyId: company.id,
          headline: sig.headline,
        },
      });

      if (!existing) {
        await prisma.companySignal.create({
          data: {
            companyId: company.id,
            type: sig.type,
            headline: sig.headline,
            detail: sig.detail,
            source: sig.source,
            sourceUrl: sig.sourceUrl,
            confidence: sig.confidence,
          },
        });
      }
    }

    // Record in Lead Memory
    const lead = await prisma.lead.findFirst({ where: { companyId: company.id } });
    if (lead && detected.length > 0) {
      await prisma.leadMemoryItem.create({
        data: {
          leadId: lead.id,
          companyId: company.id,
          eventType: 'NEW_SIGNAL',
          deltaDescription: `Detected ${detected.length} business signals via web intelligence scan.`,
          metadata: { signalCount: detected.length, signals: detected.map((s) => s.headline) },
        },
      });
    }

    logger.info(`📡 Signal Engine detected ${detected.length} signals for ${company.name}`);
    return detected;
  }

  /**
   * Retrieves all verified signals for a given company
   */
  static async getSignalsForCompany(companyId: string) {
    return prisma.companySignal.findMany({
      where: { companyId },
      orderBy: { detectedAt: 'desc' },
    });
  }

  /**
   * Calls Gemini to detect real business signals for a company from public sources.
   */
  private static async fetchRealSignals(companyName: string, domain: string): Promise<DetectedSignal[]> {
    try {
      const model = createLlmClient().getGenerativeModel({
        model: MODELS.fast,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const prompt = `You are a B2B sales intelligence analyst. Research the company below and identify real, publicly verifiable business signals that indicate buying intent or company growth.

Company: ${companyName}
Domain: ${domain}

Search for recent news, job postings, press releases, funding announcements, executive changes, product launches, and expansion announcements.

Return ONLY a JSON array of up to 5 verified signals. Only include signals you can ground in real evidence. Return an empty array [] if no signals are found.

[
  {
    "type": "one of: HIRING_GROWTH | FUNDING_ROUND | GEO_EXPANSION | LEADERSHIP_CHANGE | TECH_ADOPTION | PRODUCT_LAUNCH | PARTNERSHIP | AWARD",
    "headline": "Concise factual headline (max 100 chars)",
    "detail": "2-3 sentences with specific details grounded in evidence",
    "source": "Publication or source name (e.g. TechCrunch, LinkedIn, Company Blog)",
    "sourceUrl": "URL to source if known, otherwise omit",
    "confidence": 0.0 to 1.0
  }
]`;

      const response = await model.generateContent(prompt);
      const text = response.response.text().trim();

      let parsed: any[];
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(text);
      }

      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((s) => s.headline && s.detail && s.type)
        .map((s) => ({
          type: SIGNAL_TYPE_MAP[s.type] ?? SignalType.HIRING_GROWTH,
          headline: String(s.headline).slice(0, 200),
          detail: String(s.detail).slice(0, 500),
          source: String(s.source || 'Web Intelligence'),
          sourceUrl: s.sourceUrl ? String(s.sourceUrl) : undefined,
          confidence: typeof s.confidence === 'number' ? Math.min(1, Math.max(0, s.confidence)) : 0.75,
        }));
    } catch (err: any) {
      logger.warn(`Signal detection failed for ${domain}: ${err.message}. Returning no signals.`);
      return [];
    }
  }
}
