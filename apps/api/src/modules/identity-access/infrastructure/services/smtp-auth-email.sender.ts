import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_RENDERER,
  type IEmailRenderer,
} from '../../../notification/domain/ports/email-renderer.port';
import {
  EMAIL_SENDER,
  type IEmailSender,
} from '../../../notification/domain/ports/email-sender.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../../notification/domain/ports/notification-reader.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';

@Injectable()
export class SmtpAuthEmailSender implements IAuthEmailSender {
  constructor(
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(EMAIL_RENDERER) private readonly renderer: IEmailRenderer,
    @Inject(NOTIFICATION_READER) private readonly notifications: INotificationReader,
  ) {}

  async sendOtp(input: Parameters<IAuthEmailSender['sendOtp']>[0]): Promise<void> {
    const locale = input.locale === 'en' ? 'en' : 'vi';
    const brand = await this.notifications.loadBrand(input.tenantId);
    const path = input.purpose === 'registration'
      ? `/${locale}/auth/register/verify`
      : `/${locale}/auth/forgot-password/verify`;
    const content = await this.renderer.render(
      input.purpose === 'registration'
        ? 'auth_registration_otp'
        : 'auth_password_reset_otp',
      locale,
      brand,
      {
        tenantName: brand.name,
        recipientName: input.fullName ?? '',
        recipientEmail: input.email,
        otp: input.otp,
        expiresInMin: Math.max(1, Math.round(input.expiresInSec / 60)),
        ctaUrl: `${brand.storefrontUrl ?? 'http://localhost:5173'}${path}`,
      },
    );
    await this.email.send({
      to: input.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      attachments: content.attachments,
    });
  }
}
