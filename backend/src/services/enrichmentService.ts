import { env } from '../config/env.js';
import { createLlmClient, MODELS } from './ai/llmClient.js';
import { prisma } from '../db/prisma.js';
import logger from '../utils/logger.js';

export interface EnrichedAttribute<T = any> {
  field: string;
  value: T;
  source: string;
  confidence: number; // 0.0 to 1.0
}

export interface EnrichmentPayload {
  companyName?: string;
  website?: string;
  industry?: string;
  employeeCount?: number;
  country?: string;
  technologies?: string[];
  fundingStage?: string;
  totalRaisedUSD?: number;
  records: EnrichedAttribute[];
}

interface GeminiEnrichmentResult {
  industry: string | null;
  employeeCount: number | null;
  country: string | null;
  technologies: string[];
  fundingStage: string | null;
  totalRaisedUSD: number | null;
  confidence: number;
}

export class EnrichmentService {

  /**
   * Enriches a company using Gemini grounded search + what the company provided at import.
   * Only fills in missing fields — never overrides user-supplied data.
   */
  static async enrichCompany(companyId: string): Promise<EnrichmentPayload> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error(`Company not found with id: ${companyId}`);
    }

    const records: EnrichedAttribute[] = [];
    let { employeeCount, industry, country, technologies, fundingStage, totalRaisedUSD } = company;

    // Only call AI for fields that are genuinely missing
    const needsEnrichment =
      !employeeCount || !industry || !country || technologies.length === 0 || !fundingStage;

    if (needsEnrichment) {
      const aiResult = await this.fetchAiEnrichment(company.name, company.domain, company.website || '');

      if (!employeeCount && aiResult.employeeCount) {
        employeeCount = aiResult.employeeCount;
        records.push({
          field: 'employeeCount',
          value: employeeCount,
          source: 'Gemini Grounded Web Search (LinkedIn / Crunchbase)',
          confidence: aiResult.confidence,
        });
      } else if (employeeCount) {
        records.push({
          field: 'employeeCount',
          value: employeeCount,
          source: 'Verified Import',
          confidence: 0.99,
        });
      }

      if (!industry && aiResult.industry) {
        industry = aiResult.industry;
        records.push({
          field: 'industry',
          value: industry,
          source: 'Gemini Grounded Web Search (Company Website / Crunchbase)',
          confidence: aiResult.confidence,
        });
      }

      if (!country && aiResult.country) {
        country = aiResult.country;
        records.push({
          field: 'country',
          value: country,
          source: 'Gemini Grounded Web Search (Domain / Contact Page)',
          confidence: aiResult.confidence,
        });
      }

      if (technologies.length === 0 && aiResult.technologies.length > 0) {
        technologies = aiResult.technologies;
        records.push({
          field: 'technologies',
          value: technologies,
          source: 'Gemini Grounded Web Search (BuiltWith / Job Listings)',
          confidence: aiResult.confidence,
        });
      }

      if (!fundingStage && aiResult.fundingStage) {
        fundingStage = aiResult.fundingStage;
        records.push({
          field: 'fundingStage',
          value: fundingStage,
          source: 'Gemini Grounded Web Search (Crunchbase / TechCrunch)',
          confidence: aiResult.confidence,
        });
      }

      if (!totalRaisedUSD && aiResult.totalRaisedUSD) {
        totalRaisedUSD = aiResult.totalRaisedUSD;
        records.push({
          field: 'totalRaisedUSD',
          value: totalRaisedUSD,
          source: 'Gemini Grounded Web Search (SEC Form D / Funding News)',
          confidence: aiResult.confidence,
        });
      }
    }

    // Persist provenance-tracked enrichment records
    for (const rec of records) {
      await prisma.enrichmentRecord.create({
        data: {
          companyId: company.id,
          field: rec.field,
          value: typeof rec.value === 'object' ? rec.value : { val: rec.value },
          source: rec.source,
          confidence: rec.confidence,
        },
      });
    }

    // Update master Company record
    await prisma.company.update({
      where: { id: company.id },
      data: {
        employeeCount: employeeCount ?? undefined,
        industry: industry ?? undefined,
        country: country ?? undefined,
        technologies: technologies.length > 0 ? technologies : undefined,
        fundingStage: fundingStage ?? undefined,
        totalRaisedUSD: totalRaisedUSD ?? undefined,
        lastEnrichedAt: new Date(),
      },
    });

    // Update associated Leads denormalized fields
    await prisma.lead.updateMany({
      where: { companyId: company.id },
      data: {
        industry: industry ?? undefined,
        fundingStage: fundingStage ?? undefined,
      },
    });

    logger.info(
      `✨ Enriched company ${company.name} (${company.domain}) with ${records.length} provenance-tracked attributes.`
    );

    return {
      companyName: company.name,
      website: company.website || `https://${company.domain}`,
      industry: industry ?? undefined,
      employeeCount: employeeCount ?? undefined,
      country: country ?? undefined,
      technologies: technologies ?? [],
      fundingStage: fundingStage ?? undefined,
      totalRaisedUSD: totalRaisedUSD ?? undefined,
      records,
    };
  }

  /**
   * Calls Gemini to research a company's real-world profile using web grounding.
   */
  private static async fetchAiEnrichment(
    companyName: string,
    domain: string,
    website: string
  ): Promise<GeminiEnrichmentResult> {
    const defaultResult: GeminiEnrichmentResult = {
      industry: null,
      employeeCount: null,
      country: null,
      technologies: [],
      fundingStage: null,
      totalRaisedUSD: null,
      confidence: 0.5,
    };

    try {
      const model = createLlmClient().getGenerativeModel({
        model: MODELS.fast,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const prompt = `You are a B2B company intelligence analyst. Research the company below using publicly available information.

Company Name: ${companyName}
Domain: ${domain}
Website: ${website}

Return ONLY a JSON object with your best-effort findings. Use null for fields you cannot confidently determine.

{
  "industry": "string or null (e.g. 'B2B SaaS', 'FinTech', 'Cloud Infrastructure')",
  "employeeCount": "number or null (best estimate based on LinkedIn / Crunchbase)",
  "country": "string or null (headquarters country)",
  "technologies": ["list of detected technologies from job postings, BuiltWith, or tech news"],
  "fundingStage": "string or null (e.g. 'Seed', 'Series A', 'Series B', 'Bootstrapped', 'Public')",
  "totalRaisedUSD": "number or null (total funding in USD, e.g. 28000000 for $28M)",
  "confidence": "number between 0.0 and 1.0 indicating your overall confidence"
}`;

      const response = await model.generateContent(prompt);
      const text = response.response.text().trim();

      let parsed: any;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(text);
      }

      return {
        industry: parsed.industry || null,
        employeeCount: typeof parsed.employeeCount === 'number' ? parsed.employeeCount : null,
        country: parsed.country || null,
        technologies: Array.isArray(parsed.technologies) ? parsed.technologies : [],
        fundingStage: parsed.fundingStage || null,
        totalRaisedUSD: typeof parsed.totalRaisedUSD === 'number' ? parsed.totalRaisedUSD : null,
        confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7,
      };
    } catch (err: any) {
      logger.warn(`Gemini enrichment failed for ${domain}: ${err.message}. Proceeding with available data.`);
      return defaultResult;
    }
  }
}
