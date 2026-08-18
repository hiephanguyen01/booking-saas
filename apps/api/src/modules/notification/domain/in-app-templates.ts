import type { TemplateData } from './email-template';
import type { NotificationTemplateId } from './notification-plan';
import type { NotificationArea, NotificationTargetType } from './notification-area';

export interface InAppTemplate {
  area: NotificationArea;
  title: string;
  targetType: NotificationTargetType;
  /** `'booking'` takes the delivery's bookingId; `null` targets a list screen. */
  targetId: 'booking' | null;
  /**
   * The row's second line, built from the SAME `TemplateData` the email renders
   * from — so the bell can never claim a detail the email does not. Omit it when
   * the title already says everything; a row with no body is a supported state
   * the dashboard renders as a single line.
   */
  body?: (data: TemplateData) => string | null;
}

/** Longest body we will store. A rejection reason is free text a human typed and
 *  has no length bound; the bell shows two lines, so anything past this is dead
 *  weight in every row of the feed. The full text lives in the email and on the
 *  screen the row links to. */
const MAX_BODY = 200;

/** The tax dispatcher substitutes an em dash for a missing certificate number so
 *  the EMAIL has something to print in its table cell. A bell row has no table:
 *  dropped here, it degrades to "Năm 2026" instead of leading with a dash. */
const EMAIL_PLACEHOLDER = '—';

/** A `TemplateData` string, or undefined when it is only an email placeholder. */
function present(value: string | undefined): string | undefined {
  return value === EMAIL_PLACEHOLDER ? undefined : value;
}

/**
 * Joins the present parts with ` · ` and returns null when nothing survived.
 *
 * Every builder goes through this rather than interpolating directly, because
 * most `TemplateData` fields are optional: a template string would happily emit
 * `"undefined"` or a dangling separator into a row that is then stored forever.
 */
function line(...parts: Array<string | number | undefined | null>): string | null {
  const text = parts
    .filter((part): part is string | number => part !== undefined && part !== null && part !== '')
    .join(' · ');
  if (!text) return null;
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1).trimEnd()}…` : text;
}

/**
 * Which email templates ALSO produce a bell row, and what that row says.
 *
 * ⚠️ ABSENCE IS A DECISION, NOT AN OVERSIGHT. Every `*_customer` template is
 * absent because customers never open the dashboard; both OTP templates are
 * absent because an OTP is not news; `tenant_member_invited` is absent because
 * its recipient may not have an account yet. When adding an email template,
 * decide deliberately whether it belongs here.
 *
 * Titles are written for a BELL, not an inbox — short, no booking-code
 * ceremony, no "Kính gửi". Bodies carry the one detail that makes the row
 * actionable without opening it: WHICH listing, WHEN, HOW MUCH.
 *
 * Copy here is Vietnamese-only, matching the titles above and the dashboard the
 * rows are read in. `TemplateData` is built per-recipient-locale, so an `en`
 * recipient still gets an English EMAIL — only the bell is Vietnamese, exactly
 * as it was before bodies existed.
 */
export const IN_APP_TEMPLATES: Partial<Record<NotificationTemplateId, InAppTemplate>> = {
  booking_pending_approval_partner: {
    area: 'partner', title: 'Lượt đặt mới chờ duyệt',
    targetType: 'partner_booking', targetId: 'booking',
    body: (d) => line(d.listingTitle, d.startsAt, d.amount),
  },
  booking_confirmed_partner: {
    area: 'partner', title: 'Lượt đặt đã xác nhận',
    targetType: 'partner_booking', targetId: 'booking',
    body: (d) => line(d.listingTitle, d.startsAt),
  },
  booking_cancelled_partner: {
    area: 'partner', title: 'Lượt đặt đã huỷ',
    targetType: 'partner_booking', targetId: 'booking',
    body: (d) => line(d.listingTitle, d.startsAt, d.reason),
  },
  booking_refunded_partner: {
    area: 'partner', title: 'Lượt đặt đã hoàn tiền',
    targetType: 'partner_booking', targetId: 'booking',
    // `refundAmount` is only set when the refund was non-zero, so a zero-refund
    // cancellation quietly falls back to listing + slot rather than "Hoàn ".
    body: (d) => line(d.listingTitle, d.refundAmount && `Hoàn ${d.refundAmount}`),
  },
  booking_auto_completed_partner: {
    area: 'partner', title: 'Lượt đặt được tự động hoàn tất',
    targetType: 'partner_booking', targetId: 'booking',
    body: (d) => line(d.listingTitle, d.startsAt),
  },
  listing_published_partner: {
    area: 'partner', title: 'Tin đăng đã được duyệt',
    targetType: 'partner_listings', targetId: null,
    body: (d) => line(d.listingTitle),
  },
  listing_hidden_partner: {
    area: 'partner', title: 'Tin đăng đã bị ẩn',
    targetType: 'partner_listings', targetId: null,
    body: (d) => line(d.listingTitle, d.reason),
  },
  listing_change_approved_partner: {
    area: 'partner', title: 'Chỉnh sửa tin đã được duyệt',
    targetType: 'partner_listings', targetId: null,
    body: (d) => line(d.listingTitle),
  },
  listing_change_rejected_partner: {
    area: 'partner', title: 'Chỉnh sửa tin bị từ chối',
    targetType: 'partner_listings', targetId: null,
    body: (d) => line(d.listingTitle, d.reason),
  },
  partner_application_received: {
    area: 'partner', title: 'Đã nhận đơn đăng ký đối tác',
    targetType: 'partner_profile', targetId: null,
    body: (d) => line(d.tenantName),
  },
  partner_approved: {
    area: 'partner', title: 'Tài khoản đối tác đã được duyệt',
    targetType: 'partner_profile', targetId: null,
    body: (d) => line(d.tenantName),
  },
  partner_agreement_recorded: {
    area: 'partner', title: 'Đã ghi nhận điều khoản hợp tác',
    targetType: 'partner_profile', targetId: null,
    body: (d) => line(d.agreementVersions),
  },
  payout_paid_partner: {
    area: 'partner', title: 'Đã chi trả đối soát',
    targetType: 'partner_revenue', targetId: null,
    body: (d) => line(d.amount),
  },
  tax_certificate_issued_partner: {
    area: 'partner', title: 'Đã cấp chứng từ khấu trừ thuế',
    targetType: 'partner_revenue', targetId: null,
    body: (d) => line(present(d.certificateNumber), d.taxYear && `Năm ${d.taxYear}`),
  },
  tax_certificate_voided_partner: {
    area: 'partner', title: 'Chứng từ khấu trừ thuế đã bị huỷ',
    targetType: 'partner_revenue', targetId: null,
    body: (d) => line(present(d.certificateNumber), d.taxYear && `Năm ${d.taxYear}`, d.reason),
  },
  legal_document_published_partner: {
    area: 'partner', title: 'Điều khoản đối tác có phiên bản mới',
    targetType: 'partner_home', targetId: null,
    body: (d) => line(d.legalVersionNo && `Phiên bản ${d.legalVersionNo}`),
  },
  legal_document_published_affiliate: {
    area: 'affiliate', title: 'Điều khoản affiliate có phiên bản mới',
    targetType: 'affiliate_home', targetId: null,
    body: (d) => line(d.legalVersionNo && `Phiên bản ${d.legalVersionNo}`),
  },
};
