import type { EmailBrand, EmailContent, TemplateData } from '../email-template';
import type { NotificationTemplateId } from '../notification-plan';

export const EMAIL_RENDERER = Symbol('EMAIL_RENDERER');

export type AuthEmailTemplateId = 'auth_registration_otp' | 'auth_password_reset_otp';
export type EmailTemplateId = NotificationTemplateId | AuthEmailTemplateId;

export interface IEmailRenderer {
  render(
    templateId: EmailTemplateId,
    locale: string | null | undefined,
    brand: EmailBrand,
    data: TemplateData,
  ): Promise<EmailContent>;
}
