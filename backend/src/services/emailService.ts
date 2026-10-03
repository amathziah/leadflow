import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Real outbound email over SMTP.
 *
 * SMTP is deliberately the only transport: it works with Gmail app passwords,
 * SendGrid, Mailgun, Postmark, Amazon SES and self-hosted relays alike, so the
 * tool stays usable without binding anyone to one vendor.
 *
 * If SMTP is not configured, `send` throws. Callers must not record a message
 * as SENT in that case — a state machine that marks delivery it never performed
 * is worse than one that refuses to act.
 */

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super(
      'SMTP is not configured, so this message cannot be sent.\n' +
        'Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in backend/.env.\n' +
        'Gmail example: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, and an App Password\n' +
        '(https://myaccount.google.com/apppasswords) as SMTP_PASSWORD.\n' +
        'Until then you can still copy or export approved drafts from the review screen.'
    );
    this.name = 'SmtpNotConfiguredError';
  }
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

class EmailService {
  private transporter: Transporter | null = null;

  public isConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
  }

  /** Describes the active configuration for the UI, never exposing the password. */
  public describe() {
    return {
      configured: this.isConfigured(),
      host: env.SMTP_HOST || null,
      port: env.SMTP_PORT,
      from: env.SMTP_FROM || null,
    };
  }

  private getTransporter(): Transporter {
    if (!this.isConfigured()) throw new SmtpNotConfiguredError();
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER as string, pass: env.SMTP_PASSWORD as string },
      });
    }
    return this.transporter;
  }

  /** Verifies credentials against the server so setup problems surface early. */
  public async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'SMTP is not configured.' };
    try {
      await this.getTransporter().verify();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  public async send(params: {
    to: string;
    subject: string;
    body: string;
    replyTo?: string;
  }): Promise<SendResult> {
    const transporter = this.getTransporter();

    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      text: params.body,
      // Preserve the author's line breaks without inventing any other markup.
      html: params.body
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br>'),
      replyTo: params.replyTo || env.SMTP_FROM,
    });

    logger.info(`📧 Email sent to ${params.to} (messageId: ${info.messageId})`);
    return {
      messageId: info.messageId,
      accepted: (info.accepted || []).map(String),
      rejected: (info.rejected || []).map(String),
    };
  }
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const emailService = new EmailService();
export default emailService;
