import { prisma } from '../db/prisma.js';
import { ResponseIntent, OutreachChannel } from '@prisma/client';
import { ScoringService } from './scoringService.js';
import logger from '../utils/logger.js';

export interface ResponseClassificationResult {
  classification: ResponseIntent;
  confidence: number;
  reasoning: string;
  leadId: string;
  newLeadStatus: string;
  reScoredTotal: number;
}

export class ResponseAnalysisService {
  /**
   * Classifies an inbound prospect response and triggers dynamic status updates and lead re-scoring.
   */
  static async processInboundResponse(
    leadId: string,
    rawContent: string,
    messageId?: string,
    channel: OutreachChannel = OutreachChannel.EMAIL
  ): Promise<ResponseClassificationResult> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { company: true },
    });

    if (!lead || !lead.company) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    const text = rawContent.trim().toLowerCase();

    // 1. Classification (Deterministic rule evaluation + intent heuristics)
    let classification: ResponseIntent = ResponseIntent.FOLLOW_UP;
    let confidence = 0.95;
    let reasoning = '';

    if (
      text.includes('unsubscribe') ||
      text.includes('remove me') ||
      text.includes('stop emailing') ||
      text.includes('opt out') ||
      text.includes('do not contact')
    ) {
      classification = ResponseIntent.UNSUBSCRIBE;
      reasoning = 'Prospect explicitly requested unsubscription or opt-out.';
    } else if (
      text.includes('interested') ||
      text.includes('tuesday') ||
      text.includes('thursday') ||
      text.includes('demo') ||
      text.includes('call') ||
      text.includes('send over') ||
      text.includes('available') ||
      text.includes('schedule') ||
      text.includes('sounds good') ||
      text.includes('lets chat') ||
      text.includes("let's chat")
    ) {
      classification = ResponseIntent.INTERESTED;
      reasoning = 'Prospect confirmed interest or requested calendar availability/demo.';
    } else if (
      text.includes('not interested') ||
      text.includes('no thank') ||
      text.includes('no need') ||
      text.includes('not right now') ||
      text.includes('pass on this')
    ) {
      classification = ResponseIntent.NOT_INTERESTED;
      reasoning = 'Prospect politely declined current interest.';
    } else {
      classification = ResponseIntent.FOLLOW_UP;
      reasoning = 'Prospect provided conditional objection or requested future follow-up.';
    }

    // 2. Persist response in inbound_responses
    const responseRecord = await prisma.inboundResponse.create({
      data: {
        leadId: lead.id,
        messageId: messageId || null,
        channel,
        rawContent,
        classification,
        confidence,
        reasoning,
      },
    });

    // 3. Determine new stage and status
    let newLeadStatus = lead.status;
    let newConversationStage = lead.conversationStage;

    switch (classification) {
      case ResponseIntent.INTERESTED:
        newLeadStatus = 'RESPONDED';
        newConversationStage = 'MEETING_REQUESTED';
        break;
      case ResponseIntent.FOLLOW_UP:
        newLeadStatus = 'RESPONDED';
        newConversationStage = 'OBJECTION_HANDLING';
        break;
      case ResponseIntent.NOT_INTERESTED:
        newLeadStatus = 'LOST';
        newConversationStage = 'UNRESPONSIVE';
        break;
      case ResponseIntent.UNSUBSCRIBE:
        newLeadStatus = 'LOST';
        newConversationStage = 'UNRESPONSIVE';
        break;
    }

    // Update Lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: newLeadStatus as any,
        conversationStage: newConversationStage,
        lastChatAt: new Date(),
        conversationSummary: `Received ${classification} reply: "${rawContent.slice(0, 80)}..."`,
      },
    });

    // 4. Record event in Lead Memory
    await prisma.leadMemoryItem.create({
      data: {
        leadId: lead.id,
        companyId: lead.company.id,
        eventType: 'RESPONSE_RECEIVED',
        deltaDescription: `Inbound reply classified as ${classification}. ${reasoning}`,
        metadata: {
          responseId: responseRecord.id,
          classification,
          rawContent,
        },
      },
    });

    // 5. Re-score the lead dynamically to account for response engagement!
    const reScore = await ScoringService.scoreLead(lead.id);

    logger.info(`💬 Inbound response processed for ${lead.fullName}: classified ${classification}. Lead re-scored: ${reScore.totalScore}/100.`);

    return {
      classification,
      confidence,
      reasoning,
      leadId: lead.id,
      newLeadStatus,
      reScoredTotal: reScore.totalScore,
    };
  }
}
