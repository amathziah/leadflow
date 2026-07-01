import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';
import logger from '../../utils/logger.js';

interface LeadScoreResult {
  leadScore: number;
  priority: string;
  industry: string;
  reason: string;
  contactRole?: string;
  contactName?: string;
}

class GeminiService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    logger.info('🧠 Gemini AI Service initialized with Google SDK configurations');
  }

  /**
   * Evaluates scraped website contents using gemini-2.5-pro.
   * Enforces strict schema validations and returns structured JSON leads insights.
   */
  public async scoreLead(
    scrapedText: string,
    query: string
  ): Promise<LeadScoreResult> {
    try {
      logger.info(`Evaluating company profile matching target query: "${query}" using gemini-2.5-pro...`);

      // Initialize modern pro model
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
      });

      const systemPrompt = `You are a staff-level Sales Intelligence Agent. Your goal is to review the scraped text content from a company's website and evaluate how closely they align with the user's lead search query: "${query}".

Evaluation Rules:
1. Assign a numerical rating (leadScore) between 0 and 100 based on alignment with the query.
2. Designate a priority tier: HIGH (score >= 85), MEDIUM (score between 55 and 84), or LOW (score < 55).
3. Classify the company's general industry vertical (e.g. AI SaaS, Developer Tools, HealthTech, etc.).
4. Provide a concise, professional reason explaining your evaluation. Avoid boilerplate text.
5. Identify or infer the contact decision-maker's job title/role (contactRole). E.g. Co-Founder, CEO, VP of Sales, CTO, etc.
6. Extract the actual name of a founder, co-founder, CEO, or executive found in the website text (contactName). If multiple are found, choose the top executive (e.g., CEO). Return an empty string if none are found.

Analyze the visible page content block below:
---
${scrapedText}
---`;

      // Define strict JSON schema matching database columns
      const responseSchema = {
        type: "object",
        properties: {
          leadScore: {
            type: "integer",
            description: 'Numerical rating from 0 to 100 rating ICP alignment',
          },
          priority: {
            type: "string",
            description: 'Lead urgency category: HIGH, MEDIUM, or LOW',
          },
          industry: {
            type: "string",
            description: 'General category of industry parsed from content',
          },
          reason: {
            type: "string",
            description: 'Concise qualitative justification explaining why this score was assigned',
          },
          contactRole: {
            type: "string",
            description: 'The job title/role of the contact decision-maker (e.g. Co-Founder, CEO, CTO). Default to "Co-Founder & CEO" if not found or unclear.',
          },
          contactName: {
            type: "string",
            description: 'The full name of the founder, CEO, or key executive. Return an empty string if not mentioned.',
          },
        },
        required: ['leadScore', 'priority', 'industry', 'reason', 'contactRole', 'contactName'],
      };

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.1, // Low temperature for high consistency
        } as any,
      });


      const responseText = result.response.text();
      logger.debug(`Gemini Pro scoring response: ${responseText}`);

      const scorePayload: LeadScoreResult = JSON.parse(responseText);
      
      logger.info(`✅ Score assigned: ${scorePayload.leadScore}/100 | Priority: ${scorePayload.priority}`);
      return scorePayload;
    } catch (error: any) {
      logger.error(`❌ Gemini Pro Lead scoring failure: ${error.message}`);
      // Fallback response to prevent pipeline lock
      return {
        leadScore: 50,
        priority: 'MEDIUM',
        industry: 'Unknown',
        reason: `Automated scoring fell back due to analysis warning: ${error.message}`,
        contactRole: 'Co-Founder & CEO',
        contactName: '',
      };
    }
  }

  /**
   * Generates a personalized LinkedIn connection invitation message limited to 300 characters
   */
  public async generateLinkedInInvite(
    companyText: string,
    contactName: string,
    contactRole: string
  ): Promise<string> {
    try {
      logger.info(`Generating personalized LinkedIn connection invite note for ${contactName} (${contactRole}) using gemini-2.5-flash...`);

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      const prompt = `You are a professional outreach copywriter. Draft a personalized, peer-to-peer LinkedIn connection request note for a prospect.
      
Prospect Details:
- Name: ${contactName}
- Title/Role: ${contactRole}
- Scraped Website Context:
---
${companyText.slice(0, 4000)}
---

Strict Rules:
1. The entire message MUST be strictly 300 characters or less (including spaces, punctuation, greetings, and sign-offs). This is a hard limit.
2. Personalize the note by referencing their product, company, or value proposition.
3. Keep the tone friendly, professional, conversational, and direct (write like a peer).
4. Avoid standard fluff/clichés (like "I'd love to connect with you to exchange synergies" or "hope you are well").
5. Do NOT include email signatures. A short sign-off like "Best, [Your Name]" or no sign-off is fine.

Draft the note below:`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
        },
      });

      let inviteText = result.response.text().trim();
      // Clean up any quotes if gemini wraps it in quotes
      if (inviteText.startsWith('"') && inviteText.endsWith('"')) {
        inviteText = inviteText.slice(1, -1);
      }
      
      // Enforce the 300 character limit strictly on our side just in case
      if (inviteText.length > 300) {
        inviteText = inviteText.slice(0, 297) + '...';
      }

      logger.info(`✅ Custom LinkedIn invite generated successfully (${inviteText.length} chars)`);
      return inviteText;
    } catch (error: any) {
      logger.error(`❌ Gemini Flash LinkedIn invite generation failure: ${error.message}`);
      // Return a robust generic template under 300 characters
      const fallback = `Hi ${contactName}, noticed your work as ${contactRole}. Impressed by what you're building. Let's connect!`;
      return fallback;
    }
  }

  /**
   * Personalizes a high-converting cold email outreach copy using gemini-2.5-flash
   */
  public async generateOutreach(
    scrapedText: string,
    scoringReason: string,
    contactName?: string
  ): Promise<string> {
    try {
      logger.info('Generating personalized cold sales outreach copy using gemini-2.5-flash...');

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      const targetContact = contactName || 'Founder';

      const prompt = `You are an elite, high-performance SDR (Sales Development Representative) copywriting agent. 
Your goal is to draft a hyper-personalized, direct, and conversational cold outreach email targeting the contact: "${targetContact}".

Guidelines for high-conversion sales copy:
1. Be highly customized: Mention specific products, slogans, services, or unique developer workflows found in their scraped text.
2. Tone: Be direct, conversational, and natural. Write like a peer speaking to another peer. AVOID high-friction corporate buzzwords, hyperbole, or sales cliches (e.g. "revolutionary", "game-changing").
3. Strictly AVOID standard opening boilerplate like "Hope this email finds you well" or "Hope you're having a great week". Start directly with context.
4. Keep it extremely brief: Limit your copy to 3 short paragraphs (maximum 150 words total).
5. Actionable Call-To-Action (CTA): End with a low-friction request for a brief 10-minute introduction call next Tuesday or Wednesday.

Input context details:
- Scraped Company Website Content Excerpt:
---
${scrapedText.slice(0, 8000)}
---
- Lead Scorer Analysis Context:
"${scoringReason}"

Write the personalized cold outreach email below, including a clear Subject line at the very top:`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7, // Higher temperature for more natural, creative phrasing
        },
      });

      const outreachText = result.response.text();
      logger.info('✅ Custom email outreach copy generated successfully');
      
      return outreachText.trim();
    } catch (error: any) {
      logger.error(`❌ Gemini Flash outreach generation failure: ${error.message}`);
      // Fallback copy
      return `Subject: Introduction to LeadFlow / Meeting request\n\nHi ${contactName || 'there'},\n\nI was looking at your website online and was very impressed with your recent work. We build scaling pipelines that optimize custom sales workflows.\n\nWould you be open to a brief 10-minute introduction call Tuesday next week?\n\nBest regards,\nSales Outreach Coordinator`;
    }
  }

  /**
   * Generates a conversational research summary with inline citations [1], [2]
   * based on the scraped content of search result websites.
   */
  public async synthesizeSearchSummary(
    sources: Array<{ title: string; url: string; content: string }>,
    query: string
  ): Promise<string> {
    try {
      logger.info(`Synthesizing research summary for query: "${query}" using gemini-2.5-pro...`);

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
      });

      // Format sources list for prompt
      const formattedSources = sources
        .map((src, idx) => `[Source ${idx + 1}] Title: "${src.title}" | URL: ${src.url}\nContent:\n${src.content.slice(0, 5000)}`)
        .join('\n\n---\n\n');

      const prompt = `You are a conversational research engine similar to Perplexity AI. Your goal is to synthesize a high-quality, objective, and detailed answer explaining the findings for the user query: "${query}" based on the scraped website contents of the discovered target leads.

Guidelines:
1. Synthesize a comprehensive overview (2-4 paragraphs) answering the search query. Highlighting who these companies are, their core value propositions, and how they match the target profile.
2. You MUST use inline citations to reference the sources. For example, if facts are extracted from Source 1, append "[1]" right after the sentence or clause. If from Source 2, use "[2]".
3. Keep the tone professional, objective, and analytical. Do not invent facts that are not present in the sources.
4. If no sources are provided or they contain no relevant text, explain that no company information could be extracted for analysis.

Scraped sources to analyze:
---
${formattedSources}
---

Provide the synthesized response below:`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3, // Lower temperature for factuality
        },
      });

      const summaryText = result.response.text();
      logger.info('✅ Search synthesis summary generated successfully');
      return summaryText.trim();
    } catch (error: any) {
      logger.error(`❌ Search synthesis summary failure: ${error.message}`);
      
      // Generate standard fallback summary based on sources
      return `We found several company prospects matching your query. They include:\n\n${sources.map((s, i) => `- ${s.title} is an active industry player [${i + 1}].`).join('\n')}\n\nFor more details, check their respective corporate portals.`;
    }
  }
}

export const geminiService = new GeminiService();
export default geminiService;
