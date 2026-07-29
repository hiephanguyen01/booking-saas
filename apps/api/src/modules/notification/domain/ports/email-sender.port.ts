import type { EmailAttachment } from '../email-template';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

/** Outbound email transport (§17). SMTP/mailpit in dev; a log-only fallback in tests. */
export interface IEmailSender {
  send(message: EmailMessage): Promise<void>;
}
