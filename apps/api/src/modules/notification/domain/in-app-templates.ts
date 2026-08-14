import type { NotificationTemplateId } from './notification-plan';
import type { NotificationArea, NotificationTargetType } from './notification-area';

export interface InAppTemplate {
  area: NotificationArea;
  title: string;
  targetType: NotificationTargetType;
  /** `'booking'` takes the delivery's bookingId; `null` targets a list screen. */
  targetId: 'booking' | null;
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
 * ceremony, no "Kính gửi".
 */
export const IN_APP_TEMPLATES: Partial<Record<NotificationTemplateId, InAppTemplate>> = {
  booking_pending_approval_partner: {
    area: 'partner', title: 'Lượt đặt mới chờ duyệt',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_confirmed_partner: {
    area: 'partner', title: 'Lượt đặt đã xác nhận',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_cancelled_partner: {
    area: 'partner', title: 'Lượt đặt đã huỷ',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_refunded_partner: {
    area: 'partner', title: 'Lượt đặt đã hoàn tiền',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_auto_completed_partner: {
    area: 'partner', title: 'Lượt đặt được tự động hoàn tất',
    targetType: 'partner_booking', targetId: 'booking',
  },
  listing_published_partner: {
    area: 'partner', title: 'Tin đăng đã được duyệt',
    targetType: 'partner_listings', targetId: null,
  },
  listing_hidden_partner: {
    area: 'partner', title: 'Tin đăng đã bị ẩn',
    targetType: 'partner_listings', targetId: null,
  },
  listing_change_approved_partner: {
    area: 'partner', title: 'Chỉnh sửa tin đã được duyệt',
    targetType: 'partner_listings', targetId: null,
  },
  listing_change_rejected_partner: {
    area: 'partner', title: 'Chỉnh sửa tin bị từ chối',
    targetType: 'partner_listings', targetId: null,
  },
  partner_application_received: {
    area: 'partner', title: 'Đã nhận đơn đăng ký đối tác',
    targetType: 'partner_profile', targetId: null,
  },
  partner_approved: {
    area: 'partner', title: 'Tài khoản đối tác đã được duyệt',
    targetType: 'partner_profile', targetId: null,
  },
  partner_agreement_recorded: {
    area: 'partner', title: 'Đã ghi nhận điều khoản hợp tác',
    targetType: 'partner_profile', targetId: null,
  },
  payout_paid_partner: {
    area: 'partner', title: 'Đã chi trả đối soát',
    targetType: 'partner_revenue', targetId: null,
  },
  tax_certificate_issued_partner: {
    area: 'partner', title: 'Đã cấp chứng từ khấu trừ thuế',
    targetType: 'partner_revenue', targetId: null,
  },
  tax_certificate_voided_partner: {
    area: 'partner', title: 'Chứng từ khấu trừ thuế đã bị huỷ',
    targetType: 'partner_revenue', targetId: null,
  },
  legal_document_published_partner: {
    area: 'partner', title: 'Điều khoản đối tác có phiên bản mới',
    targetType: 'partner_home', targetId: null,
  },
  legal_document_published_affiliate: {
    area: 'affiliate', title: 'Điều khoản affiliate có phiên bản mới',
    targetType: 'affiliate_home', targetId: null,
  },
};
