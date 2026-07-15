import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_SENDER,
  type IEmailSender,
} from '../../../notification/domain/ports/email-sender.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });

@Injectable()
export class SmtpAuthEmailSender implements IAuthEmailSender {
  constructor(@Inject(EMAIL_SENDER) private readonly email: IEmailSender) {}

  async sendOtp(input: Parameters<IAuthEmailSender['sendOtp']>[0]): Promise<void> {
    const minutes = Math.max(1, Math.round(input.expiresInSec / 60));
    const isVi = input.locale === 'vi';
    const action = isVi
      ? input.purpose === 'registration'
        ? 'xác minh đăng ký'
        : 'đặt lại mật khẩu'
      : input.purpose === 'registration'
        ? 'verify your registration'
        : 'reset your password';
    const subject = isVi ? `Mã xác thực để ${action}` : `Your code to ${action}`;
    const greeting = input.fullName
      ? isVi
        ? `Xin chào ${input.fullName},`
        : `Hi ${input.fullName},`
      : isVi
        ? 'Xin chào,'
        : 'Hello,';
    const text = isVi
      ? `${greeting}\n\nMã xác thực để ${action} là: ${input.otp}\nMã có hiệu lực trong ${minutes} phút. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`
      : `${greeting}\n\nYour verification code to ${action} is: ${input.otp}\nIt expires in ${minutes} minutes. If you did not request this, ignore this email.`;
    const html = `<div style="font-family:Arial,sans-serif;color:#202124;line-height:1.6"><p>${escapeHtml(greeting)}</p><p>${isVi ? `Mã xác thực để ${escapeHtml(action)} là:` : `Your verification code to ${escapeHtml(action)} is:`}</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${input.otp}</p><p>${isVi ? `Mã có hiệu lực trong ${minutes} phút.` : `It expires in ${minutes} minutes.`}</p><p style="color:#6b7280">${isVi ? 'Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.' : 'If you did not request this, ignore this email.'}</p></div>`;
    await this.email.send({ to: input.email, subject, text, html });
  }
}
