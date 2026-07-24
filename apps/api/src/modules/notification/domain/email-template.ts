import type { NotificationTemplateId } from './notification-plan';

/**
 * Pure bilingual (vi/en) email rendering (TONG-QUAN.md §17). Templates are plain
 * functions of their data + the recipient locale so they are trivially testable and
 * free of framework/i18n-runtime coupling. The recipient's `users.locale` decides
 * the language; `vi` is the fallback.
 */
export type Locale = 'vi' | 'en';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** Everything a template might interpolate — populated by the application layer. */
export interface TemplateData {
  tenantName: string;
  recipientName: string;
  bookingCode?: string;
  listingTitle?: string;
  /** Slot start, already formatted in the resource/tenant timezone. */
  startsAt?: string;
  /** Amounts, already formatted as VND (e.g. "600.000 ₫"). */
  amount?: string;
  refundAmount?: string;
  partnerName?: string;
  reason?: string;
  /** Guest-lookup OTP (§8.6) — the plaintext code and its lifetime in minutes. */
  otp?: string;
  expiresInMin?: number;
}

/** The recipient's locale, normalized to a supported one (`vi` is the fallback). */
export function normalizeLocale(locale: string | null | undefined): Locale {
  return locale === 'en' ? 'en' : 'vi';
}

type Copy = { subject: string; body: string };

/** vi/en subject + plain body per template. `{placeholders}` are filled from data. */
const TEMPLATES: Record<NotificationTemplateId, Record<Locale, Copy>> = {
  booking_pending_payment_customer: {
    vi: {
      subject: 'Đơn đặt {bookingCode} đang chờ thanh toán',
      body: 'Chào {recipientName}, đơn {bookingCode} cho "{listingTitle}" lúc {startsAt} đang chờ thanh toán {amount}. Vui lòng hoàn tất để giữ chỗ.',
    },
    en: {
      subject: 'Booking {bookingCode} awaiting payment',
      body: 'Hi {recipientName}, your booking {bookingCode} for "{listingTitle}" at {startsAt} is awaiting payment of {amount}. Please complete it to hold your slot.',
    },
  },
  booking_pending_approval_partner: {
    vi: {
      subject: 'Đơn đặt mới {bookingCode} cần duyệt',
      body: 'Chào {recipientName}, có đơn đặt mới {bookingCode} cho "{listingTitle}" lúc {startsAt} đang chờ bạn duyệt.',
    },
    en: {
      subject: 'New booking {bookingCode} needs approval',
      body: 'Hi {recipientName}, a new booking {bookingCode} for "{listingTitle}" at {startsAt} is waiting for your approval.',
    },
  },
  booking_approved_customer: {
    vi: {
      subject: 'Đơn {bookingCode} đã được duyệt',
      body: 'Chào {recipientName}, đơn {bookingCode} đã được duyệt. Vui lòng thanh toán {amount} để xác nhận.',
    },
    en: {
      subject: 'Booking {bookingCode} approved',
      body: 'Hi {recipientName}, booking {bookingCode} was approved. Please pay {amount} to confirm.',
    },
  },
  booking_confirmed_customer: {
    vi: {
      subject: 'Đơn {bookingCode} đã được xác nhận',
      body: 'Chào {recipientName}, đơn {bookingCode} cho "{listingTitle}" lúc {startsAt} đã được xác nhận. Hẹn gặp bạn!',
    },
    en: {
      subject: 'Booking {bookingCode} confirmed',
      body: 'Hi {recipientName}, booking {bookingCode} for "{listingTitle}" at {startsAt} is confirmed. See you there!',
    },
  },
  booking_confirmed_partner: {
    vi: {
      subject: 'Đơn {bookingCode} đã thanh toán',
      body: 'Chào {recipientName}, đơn {bookingCode} cho "{listingTitle}" lúc {startsAt} đã được thanh toán và xác nhận.',
    },
    en: {
      subject: 'Booking {bookingCode} paid',
      body: 'Hi {recipientName}, booking {bookingCode} for "{listingTitle}" at {startsAt} has been paid and confirmed.',
    },
  },
  booking_cancelled_customer: {
    vi: {
      subject: 'Đơn {bookingCode} đã bị hủy',
      body: 'Chào {recipientName}, đơn {bookingCode} đã bị hủy. Số tiền hoàn lại: {refundAmount}.',
    },
    en: {
      subject: 'Booking {bookingCode} cancelled',
      body: 'Hi {recipientName}, booking {bookingCode} has been cancelled. Refund amount: {refundAmount}.',
    },
  },
  booking_cancelled_partner: {
    vi: {
      subject: 'Đơn {bookingCode} đã bị hủy',
      body: 'Chào {recipientName}, đơn {bookingCode} cho "{listingTitle}" lúc {startsAt} đã bị hủy.',
    },
    en: {
      subject: 'Booking {bookingCode} cancelled',
      body: 'Hi {recipientName}, booking {bookingCode} for "{listingTitle}" at {startsAt} has been cancelled.',
    },
  },
  booking_completed_customer: {
    vi: {
      subject: 'Cảm ơn bạn đã sử dụng dịch vụ',
      body: 'Chào {recipientName}, đơn {bookingCode} đã hoàn tất. Cảm ơn bạn đã đặt với {tenantName}!',
    },
    en: {
      subject: 'Thanks for your booking',
      body: 'Hi {recipientName}, booking {bookingCode} is complete. Thank you for booking with {tenantName}!',
    },
  },
  booking_no_show_customer: {
    vi: {
      subject: 'Đơn {bookingCode} ghi nhận vắng mặt',
      body: 'Chào {recipientName}, đơn {bookingCode} lúc {startsAt} được ghi nhận vắng mặt (no-show).',
    },
    en: {
      subject: 'Booking {bookingCode} marked no-show',
      body: 'Hi {recipientName}, booking {bookingCode} at {startsAt} was marked as a no-show.',
    },
  },
  booking_rejected_customer: {
    vi: {
      subject: 'Đơn {bookingCode} đã bị từ chối',
      body: 'Chào {recipientName}, rất tiếc đơn {bookingCode} đã bị từ chối. {reason}',
    },
    en: {
      subject: 'Booking {bookingCode} declined',
      body: 'Hi {recipientName}, unfortunately booking {bookingCode} was declined. {reason}',
    },
  },
  booking_reminder_customer: {
    vi: {
      subject: 'Nhắc lịch: đơn {bookingCode} sắp tới',
      body: 'Chào {recipientName}, nhắc bạn đơn {bookingCode} cho "{listingTitle}" bắt đầu lúc {startsAt}.',
    },
    en: {
      subject: 'Reminder: booking {bookingCode} is coming up',
      body: 'Hi {recipientName}, a reminder that booking {bookingCode} for "{listingTitle}" starts at {startsAt}.',
    },
  },
  booking_otp_customer: {
    vi: {
      subject: 'Mã xác thực đơn {bookingCode}',
      body: 'Chào {recipientName}, mã xác thực (OTP) để xem đơn {bookingCode} của bạn là {otp}. Mã hết hạn sau {expiresInMin} phút.',
    },
    en: {
      subject: 'Your verification code for booking {bookingCode}',
      body: 'Hi {recipientName}, your verification code (OTP) to view booking {bookingCode} is {otp}. It expires in {expiresInMin} minutes.',
    },
  },
  listing_published_partner: {
    vi: {
      subject: 'Tin "{listingTitle}" đã được duyệt',
      body: 'Chào {recipientName}, tin "{listingTitle}" của bạn đã được duyệt và hiển thị công khai.',
    },
    en: {
      subject: 'Listing "{listingTitle}" is live',
      body: 'Hi {recipientName}, your listing "{listingTitle}" has been approved and is now public.',
    },
  },
  listing_hidden_partner: {
    vi: {
      subject: 'Tin "{listingTitle}" đã bị ẩn',
      body: 'Chào {recipientName}, tin "{listingTitle}" đã bị ẩn. {reason}',
    },
    en: {
      subject: 'Listing "{listingTitle}" was hidden',
      body: 'Hi {recipientName}, your listing "{listingTitle}" has been hidden. {reason}',
    },
  },
  partner_approved: {
    vi: {
      subject: 'Hồ sơ đối tác đã được duyệt',
      body: 'Chào {recipientName}, hồ sơ đối tác của bạn tại {tenantName} đã được duyệt. Bạn có thể bắt đầu đăng tin.',
    },
    en: {
      subject: 'Partner application approved',
      body: 'Hi {recipientName}, your partner application at {tenantName} was approved. You can start listing now.',
    },
  },
  payout_paid_partner: {
    vi: {
      subject: 'Đã chi trả {amount}',
      body: 'Chào {recipientName}, {tenantName} đã chi trả khoản thanh toán {amount} cho bạn. Vui lòng kiểm tra tài khoản nhận tiền của bạn.',
    },
    en: {
      subject: 'Payout of {amount} sent',
      body: 'Hi {recipientName}, {tenantName} has sent you a payout of {amount}. Please check your payout account.',
    },
  },
};

function interpolate(template: string, data: TemplateData): string {
  return template
    .replace(/\{(\w+)\}/g, (_match, key: string) => {
      const value = (data as unknown as Record<string, unknown>)[key];
      return value === undefined || value === null ? '' : String(value);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Render the subject + text + minimal HTML body for a template in a locale. */
export function renderEmail(
  templateId: NotificationTemplateId,
  locale: string | null | undefined,
  data: TemplateData,
): EmailContent {
  const copy = TEMPLATES[templateId][normalizeLocale(locale)];
  const subject = interpolate(copy.subject, data);
  const text = interpolate(copy.body, data);
  const html = `<p>${escapeHtml(text)}</p>`;
  return { subject, text, html };
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
