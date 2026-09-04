import type { NotificationTargetType } from './notification-area';

/** Which lookup produces the row's `body` — the line saying WHICH thing. */
export type SubjectKind =
  | 'listing_title'
  | 'listing_group_title'
  | 'partner_name'
  | 'booking_code'
  | 'affiliate_user_name';

export interface TenantNotificationPlanItem {
  /** Only staff holding this key in tenant scope receive the row. */
  permission: string;
  title: string;
  targetType: NotificationTargetType;
  /** Which payload key becomes `target_id`; null targets a list screen. */
  targetIdKey: string | null;
  /** Which payload key identifies the subject to look up. */
  subjectIdKey: string;
  subjectKind: SubjectKind;
}

/**
 * Tenant-facing outbox events (§17). These are IN-APP ONLY — no email — so a
 * tenant's staff are not flooded by routine moderation traffic and no new email
 * template has to be designed.
 *
 * Deliberately excluded, so this is not re-litigated per event:
 *   - `booking.created` — one chime per booking is noise; there is a bookings screen.
 *   - `payment.succeeded`, `finance.*`, `refund.*` — machine-to-machine.
 *   - `listing.created` / `listing.updated` — a partner doing partner work.
 *     Only submission for review is the tenant's business.
 */
export const TENANT_NOTIFICATION_PLAN: Record<string, TenantNotificationPlanItem> = {
  // Also dispatched by the pre-existing DispatchPartnerEventUseCase (email mirror to the
  // applicant partner) — the two coexist deliberately, targeting disjoint recipients.
  'partner.applied': {
    permission: 'tenant.partners.approve',
    title: 'Đơn đăng ký đối tác mới',
    targetType: 'tenant_partner', targetIdKey: 'partnerId',
    subjectIdKey: 'partnerId', subjectKind: 'partner_name',
  },
  'partner.identity_submitted': {
    permission: 'tenant.partners.approve',
    title: 'Đối tác nộp hồ sơ định danh',
    targetType: 'tenant_partner', targetIdKey: 'partnerId',
    subjectIdKey: 'partnerId', subjectKind: 'partner_name',
  },
  'listing.submitted': {
    permission: 'tenant.listings.publish',
    title: 'Tin đăng chờ duyệt',
    targetType: 'tenant_listing_review', targetIdKey: 'listingId',
    subjectIdKey: 'listingId', subjectKind: 'listing_title',
  },
  'listing.revision_submitted': {
    permission: 'tenant.listings.publish',
    title: 'Chỉnh sửa tin chờ duyệt',
    targetType: 'tenant_listing_review', targetIdKey: 'listingId',
    subjectIdKey: 'listingId', subjectKind: 'listing_title',
  },
  'listing_group.revision_submitted': {
    permission: 'tenant.listings.publish',
    title: 'Chỉnh sửa tin nhiều hạng mục chờ duyệt',
    targetType: 'tenant_listing_group_review', targetIdKey: 'listingGroupId',
    subjectIdKey: 'listingGroupId', subjectKind: 'listing_group_title',
  },
  'settlement.dispute_opened': {
    permission: 'tenant.disputes.resolve',
    title: 'Tranh chấp đối soát mới',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'bookingId', subjectKind: 'booking_code',
  },
  'settlement.dispute_responded': {
    permission: 'tenant.disputes.resolve',
    title: 'Đối tác đã phản hồi tranh chấp',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'bookingId', subjectKind: 'booking_code',
  },
  'review.created': {
    permission: 'tenant.reviews.read',
    title: 'Đánh giá mới',
    targetType: 'tenant_reviews', targetIdKey: null,
    subjectIdKey: 'listingId', subjectKind: 'listing_title',
  },
  'affiliate.applied': {
    permission: 'tenant.affiliates.manage',
    title: 'Đơn đăng ký affiliate mới',
    targetType: 'tenant_affiliate', targetIdKey: 'affiliateId',
    subjectIdKey: 'affiliateId', subjectKind: 'affiliate_user_name',
  },
  // Manual-refund operational state alerts are in-app notifications for finance staff.
  // Payloads contain only opaque operation/batch identifiers, never destination data.
  'manual_refund.customer_not_received': {
    permission: 'tenant.finance.read',
    title: 'Khách báo chưa nhận được tiền hoàn',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'refundBatchId', subjectKind: 'booking_code',
  },
  'manual_refund.checker_escalated': {
    permission: 'tenant.finance.read',
    title: 'Hoàn tiền thủ công chờ checker xử lý',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'refundBatchId', subjectKind: 'booking_code',
  },
  'manual_refund.transfer_submitted': {
    permission: 'tenant.finance.read',
    title: 'Hoàn tiền thủ công chờ checker kiểm tra',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'refundBatchId', subjectKind: 'booking_code',
  },
  'manual_refund.destination_requested': {
    permission: 'tenant.finance.read',
    title: 'Hoàn tiền thủ công cần thông tin nhận tiền',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'refundBatchId', subjectKind: 'booking_code',
  },
  'manual_refund.destination_ready': {
    permission: 'tenant.finance.read',
    title: 'Thông tin nhận tiền hoàn đã sẵn sàng',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'refundBatchId', subjectKind: 'booking_code',
  },
  'manual_refund.customer_details_reminder': {
    permission: 'tenant.finance.read',
    title: 'Khách chưa gửi thông tin nhận tiền hoàn',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'refundBatchId', subjectKind: 'booking_code',
  },
};

export const TENANT_NOTIFICATION_EVENTS: readonly string[] = Object.keys(TENANT_NOTIFICATION_PLAN);
