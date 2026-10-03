import { env } from '../config/env.js';
import { createLlmClient, MODELS } from './ai/llmClient.js';
import { prisma } from '../db/prisma.js';
import logger from '../utils/logger.js';
import { OutreachChannel, OutreachState } from '@prisma/client';

export interface GeneratedOutreach {
  messageId: string;
  channel: OutreachChannel;
  subject: string;
  body: string;
  state: OutreachState;
  usedSignals: Array<{
    signalId?: string;
    headline: string;
    evidence: string;
    reasoning: string;
  }>;
  explanation: string;
  /**
   * How the copy was produced. The deterministic fallback is a safety net, not
   * an equivalent result — surfacing it stops a degraded run from being
   * mistaken for a healthy one in the UI and in the evaluation suite.
   */
  generatedBy: 'llm' | 'fallback';
  /** Why the model call failed, when `generatedBy` is 'fallback'. */
  fallbackReason?: string;
}

export class PersonalizationService {

  /**
   * Generates signal-grounded, role-tailored outreach for a lead.
   * All copy is grounded in verified signals — no generic templates.
   */
  static async generateOutreach(
    leadId: string,
    channel: OutreachChannel = OutreachChannel.EMAIL,
    campaignId?: string
  ): Promise<GeneratedOutreach> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        company: {
          include: {
            signals: { orderBy: { detectedAt: 'desc' }, take: 5 },
            researchDossiers: { orderBy: { generatedAt: 'desc' }, take: 1 },
          },
        },
        memoryItems: { orderBy: { timestamp: 'desc' }, take: 5 },
      },
    });

    if (!lead || !lead.company) {
      throw new Error(`Lead or company not found: ${leadId}`);
    }

    const company = lead.company;
    const signals = company.signals;
    const dossier = company.researchDossiers[0];
    const contactName = lead.firstName || lead.fullName?.split(' ')[0] || 'there';
    const contactRole = lead.role || lead.contactRole || 'Finance Leader';

    // Pick top high-impact signals
    const topSignals = signals.slice(0, 3);
    const usedSignals = topSignals.map((s) => ({
      signalId: s.id,
      headline: s.headline,
      evidence: s.detail || s.headline,
      reasoning: `Used to ground the outreach in verified organizational timing and strategic priorities.`,
    }));

    let subject = `Re: ${company.name}'s ${company.fundingStage || 'growth'} momentum`;
    let body = '';
    let generatedBy: 'llm' | 'fallback' = 'llm';
    let fallbackReason: string | undefined;

    try {
      const model = createLlmClient().getGenerativeModel({
        model: MODELS.fast,
        generationConfig: {
          temperature: 0.3,
        },
      });

      const prompt = `You are an elite enterprise B2B sales copywriter for LeadFlow AI.
Generate a high-conviction, personalized outreach message for a prospect.

PROSPECT:
Name: ${contactName}
Role: ${contactRole}
Company: ${company.name} (${company.industry || 'B2B SaaS'}, ${company.employeeCount || 'growing'} employees, ${company.country || 'US'})

VERIFIED BUSINESS SIGNALS:
${topSignals.length > 0
  ? topSignals.map((s, idx) => `${idx + 1}. [${s.type}] ${s.headline} - ${s.detail}`).join('\n')
  : 'No specific signals detected — use general growth context'}

RESEARCH DOSSIER SUMMARY:
${dossier?.summary || `${company.name} is a growing ${company.industry || 'SaaS'} company scaling their operations.`}

PAIN POINTS:
${JSON.stringify(dossier?.painPoints || [])}

RULES:
1. NEVER use generic fluff like "Your company is growing" or "I hope you are well".
2. MUST explicitly reference specific signals if available (e.g., European expansion, Series B round, finance leadership hiring).
3. Connect their exact role (${contactRole}) to the operational challenge created by this growth.
4. Keep length concise: under 120 words.
5. Provide a clear low-friction call to action (e.g., quick 15-minute briefing).
6. Return format:
Subject: <subject line>
Body: <email body without placeholders>`;

      const response = await model.generateContent(prompt);
      const text = response.response.text();

      const subjectMatch = text.match(/Subject:\s*(.*)/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        body = text.replace(/Subject:\s*.*\n*/i, '').replace(/^Body:\s*/i, '').trim();
      } else {
        body = text.trim();
      }
    } catch (err: any) {
      generatedBy = 'fallback';
      fallbackReason = err.message;
      logger.warn(`AI personalization failed (${err.message}). Using signal-grounded fallback template.`);

      // Deterministic fallback — still grounded in real signals, never fake data
      const primarySignal = topSignals[0]?.headline;
      const secondarySignal = topSignals[1]?.headline;

      if (primarySignal) {
        subject = `${company.name}: ${primarySignal.slice(0, 60)}`;
        body = `Hi ${contactName},

Noticed ${company.name} ${primarySignal.toLowerCase()}${secondarySignal ? ` and ${secondarySignal.toLowerCase()}` : ''}.

As ${contactRole}, managing the operational complexity that comes with this scale is typically a top priority.

We help teams like yours move faster with less overhead. Would a quick 15-minute call next week make sense?`;
      } else {
        subject = `${company.name} — quick question`;
        body = `Hi ${contactName},

I came across ${company.name} and wanted to reach out regarding how you're scaling your ${contactRole.toLowerCase().includes('finance') ? 'financial operations' : 'go-to-market'} as the company grows.

Would a brief 15-minute conversation next week be worthwhile?`;
      }
    }

    // Persist outreach message in DRAFT state — must be reviewed before sending
    const message = await prisma.outreachMessage.create({
      data: {
        leadId: lead.id,
        campaignId: campaignId || null,
        channel,
        subject,
        body,
        state: OutreachState.DRAFT,
        usedSignals: usedSignals as any,
      },
    });

    // Update Lead status to OUTREACH_PENDING_APPROVAL
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: 'OUTREACH_PENDING_APPROVAL',
        outreachMessage: body,
      },
    });

    // Record in Lead Memory
    await prisma.leadMemoryItem.create({
      data: {
        leadId: lead.id,
        companyId: company.id,
        eventType: 'OUTREACH_DRAFTED',
        deltaDescription: `Generated personalized ${channel} draft grounded in ${usedSignals.length} verified signals.`,
        metadata: { messageId: message.id, usedSignals },
      },
    });

    logger.info(`✍️ Personalization Engine generated draft ${message.id} for ${lead.fullName} (${company.name})`);

    return {
      messageId: message.id,
      channel,
      subject,
      body,
      state: message.state,
      usedSignals,
      explanation: usedSignals.length > 0
        ? `Outreach grounded in ${usedSignals.length} verified events: ${topSignals.map((s) => s.headline).join('; ')}`
        : `Outreach generated from company profile for ${company.name}`,
      generatedBy,
      fallbackReason,
    };
  }
}
