import { prisma } from '../db/prisma.js';
import { OutreachState } from '@prisma/client';
import { getOrCreateDefaultContext } from './seedService.js';
import { emailService } from './emailService.js';
import logger from '../utils/logger.js';

export class ReviewService {
  /**
   * Submits a DRAFT message for review
   */
  static async submitForReview(messageId: string) {
    const msg = await prisma.outreachMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);

    if (msg.state !== OutreachState.DRAFT) {
      throw new Error(`Message must be in DRAFT state to submit for review, current state: ${msg.state}`);
    }

    const updated = await prisma.outreachMessage.update({
      where: { id: messageId },
      data: { state: OutreachState.REVIEW },
    });

    logger.info(`📝 Outreach message ${messageId} submitted for human review.`);
    return updated;
  }

  /**
   * Approves an outreach message. Human sign-off is required before sending!
   */
  static async approveMessage(
    messageId: string,
    reviewerUserId?: string,
    reviewerNotes?: string,
    editedSubject?: string,
    editedBody?: string
  ) {
    const context = await getOrCreateDefaultContext();
    const effectiveUserId = reviewerUserId || context.userId;

    const msg = await prisma.outreachMessage.findUnique({
      where: { id: messageId },
      include: { lead: true },
    });

    if (!msg) throw new Error(`Message not found: ${messageId}`);
    if (msg.state === OutreachState.SENT) {
      throw new Error('Cannot approve an already sent message');
    }

    const updated = await prisma.outreachMessage.update({
      where: { id: messageId },
      data: {
        state: OutreachState.APPROVED,
        reviewerUserId: effectiveUserId,
        reviewerNotes: reviewerNotes || null,
        subject: editedSubject || msg.subject,
        body: editedBody || msg.body,
        approvedAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        orgId: msg.lead.orgId || context.organizationId,
        userId: effectiveUserId,
        action: 'OUTREACH_APPROVED',
        entityType: 'OUTREACH_MESSAGE',
        entityId: messageId,
        metadata: { leadId: msg.leadId, channel: msg.channel },
      },
    });

    // Update lead state
    await prisma.lead.update({
      where: { id: msg.leadId },
      data: { status: 'OUTREACH_READY' },
    });

    logger.info(`✅ Human Approved outreach message ${messageId} for lead ${msg.lead.fullName}`);
    return updated;
  }

  /**
   * Rejects an outreach message
   */
  static async rejectMessage(messageId: string, reason: string, reviewerUserId?: string) {
    const context = await getOrCreateDefaultContext();
    const effectiveUserId = reviewerUserId || context.userId;

    const updated = await prisma.outreachMessage.update({
      where: { id: messageId },
      data: {
        state: OutreachState.REJECTED,
        reviewerUserId: effectiveUserId,
        reviewerNotes: reason,
      },
    });

    logger.info(`🚫 Rejected outreach message ${messageId}: ${reason}`);
    return updated;
  }

  /**
   * Sends an APPROVED message for real over SMTP, then records the result.
   *
   * Ordering matters: the email goes out first and the state only advances to
   * SENT once the provider has accepted it. If delivery fails — or SMTP is not
   * configured, or the lead has no email address — the message stays APPROVED
   * and the error propagates, so the UI never shows a delivery that did not
   * happen. Only the EMAIL channel can be dispatched; LinkedIn drafts are
   * copied out of the review screen and sent by hand.
   */
  static async dispatchMessage(messageId: string) {
    const msg = await prisma.outreachMessage.findUnique({
      where: { id: messageId },
      include: { lead: { include: { company: true } } },
    });

    if (!msg) throw new Error(`Message not found: ${messageId}`);
    if (msg.state !== OutreachState.APPROVED) {
      throw new Error(
        `Message ${messageId} is in '${msg.state}' state. Only 'APPROVED' messages can be sent.`
      );
    }

    if (msg.channel !== 'EMAIL') {
      throw new Error(
        `Automated sending is only supported for the EMAIL channel (this message is ${msg.channel}). ` +
          `Copy the approved text from the review screen and send it yourself.`
      );
    }

    const recipient = msg.lead.email;
    if (!recipient) {
      throw new Error(
        `Lead "${msg.lead.fullName}" has no email address on record, so there is nowhere to send this message.`
      );
    }

    // Send first — state only advances on a confirmed handoff to the provider.
    const delivery = await emailService.send({
      to: recipient,
      subject: msg.subject || `Quick question, ${msg.lead.fullName}`,
      body: msg.body,
    });

    if (delivery.rejected.length > 0) {
      throw new Error(`The mail server rejected ${delivery.rejected.join(', ')}.`);
    }

    const sent = await prisma.outreachMessage.update({
      where: { id: messageId },
      data: {
        state: OutreachState.SENT,
        sentAt: new Date(),
      },
    });

    await prisma.lead.update({
      where: { id: msg.leadId },
      data: {
        status: 'OUTREACH_SENT',
        lastContactedAt: new Date(),
      },
    });

    if (msg.lead.company) {
      await prisma.leadMemoryItem.create({
        data: {
          leadId: msg.leadId,
          companyId: msg.lead.company.id,
          eventType: 'OUTREACH_SENT',
          deltaDescription: `Outreach emailed to ${recipient} after human sign-off.`,
          metadata: {
            messageId,
            channel: msg.channel,
            subject: msg.subject,
            providerMessageId: delivery.messageId,
          },
        },
      });
    }

    logger.info(`🚀 Outreach ${messageId} sent to ${recipient} (provider id: ${delivery.messageId})`);
    return sent;
  }
}
