import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, IEmailSender } from '../domain/ports/email-sender.port';

/**
 * SMTP email transport (§17): mailpit in dev, real SMTP/Resend in prod. Config is
 * read straight from `process.env` (same style as the S3 storage adapter). When
 * `SMTP_HOST` is unset the sender degrades to log-only so tests and CI without a
 * mail server still run green — the notification is still recorded as `sent`.
 */
@Injectable()
export class SmtpEmailSender implements IEmailSender {
  private readonly logger = new Logger(SmtpEmailSender.name);
  private transporter: Transporter | null = null;
  private readonly from = process.env.EMAIL_FROM ?? 'no-reply@bookingos.vn';

  async send(message: EmailMessage): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.debug(`[log-only email] to=${message.to} subject="${message.subject}"`);
      return;
    }
    await transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
  }

  private getTransporter(): Transporter | null {
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? '1025'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
      });
    }
    return this.transporter;
  }
}
