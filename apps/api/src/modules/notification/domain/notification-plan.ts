/**
 * Pure notification routing (TONG-QUAN.md §17). Maps a domain event to the set of
 * {audience, template} it should produce — no framework, no DB, no I/O — so the
 * dispatcher can be unit-tested and the recipient/locale resolution stays in the
 * application layer. Phase 1 is email-only (ZNS is Phase 2).
 */
export type Audience = 'customer' | 'partner';

export type NotificationTemplateId =
  | 'booking_pending_payment_customer'
  | 'booking_pending_approval_partner'
  | 'booking_approved_customer'
  | 'booking_confirmed_customer'
  | 'booking_confirmed_partner'
  | 'booking_cancelled_customer'
  | 'booking_cancelled_partner'
  | 'booking_completed_customer'
  | 'booking_no_show_customer'
  | 'booking_rejected_customer'
  | 'booking_reminder_customer'
  | 'booking_otp_customer'
  | 'listing_published_partner'
  | 'listing_hidden_partner'
  | 'partner_approved'
  | 'payout_paid_partner';

export interface NotificationPlanItem {
  audience: Audience;
  templateId: NotificationTemplateId;
}

/** Events that carry a `bookingId` and are routed by booking context. */
export const BOOKING_NOTIFICATION_EVENTS: readonly string[] = [
  'booking.created',
  'booking.approved',
  'booking.confirmed',
  'booking.cancelled',
  'booking.completed',
  'booking.no_show',
  'booking.rejected',
];

/** Events routed by listing context. */
export const LISTING_NOTIFICATION_EVENTS: readonly string[] = [
  'listing.published',
  'listing.hidden',
];

/** Events routed by partner context. */
export const PARTNER_NOTIFICATION_EVENTS: readonly string[] = ['partner.approved'];

/**
 * Events routed by payout context. Rendered with a dedicated dispatcher (needs the
 * amount), not `planForEvent`. OTP is not an event — it is sent synchronously.
 */
export const PAYOUT_NOTIFICATION_EVENTS: readonly string[] = ['payout.paid'];

/**
 * The audiences + templates for an event. `booking.created` branches on the draft
 * outcome: an approval-gated booking pings the partner to review; a pay-now booking
 * pings the customer with the payment link.
 */
export function planForEvent(
  eventType: string,
  payload: { status?: string },
): NotificationPlanItem[] {
  switch (eventType) {
    case 'booking.created':
      return payload.status === 'pending_approval'
        ? [{ audience: 'partner', templateId: 'booking_pending_approval_partner' }]
        : [{ audience: 'customer', templateId: 'booking_pending_payment_customer' }];
    case 'booking.approved':
      return [{ audience: 'customer', templateId: 'booking_approved_customer' }];
    case 'booking.confirmed':
      return [
        { audience: 'customer', templateId: 'booking_confirmed_customer' },
        { audience: 'partner', templateId: 'booking_confirmed_partner' },
      ];
    case 'booking.cancelled':
      return [
        { audience: 'customer', templateId: 'booking_cancelled_customer' },
        { audience: 'partner', templateId: 'booking_cancelled_partner' },
      ];
    case 'booking.completed':
      return [{ audience: 'customer', templateId: 'booking_completed_customer' }];
    case 'booking.no_show':
      return [{ audience: 'customer', templateId: 'booking_no_show_customer' }];
    case 'booking.rejected':
      return [{ audience: 'customer', templateId: 'booking_rejected_customer' }];
    case 'listing.published':
      return [{ audience: 'partner', templateId: 'listing_published_partner' }];
    case 'listing.hidden':
      return [{ audience: 'partner', templateId: 'listing_hidden_partner' }];
    case 'partner.approved':
      return [{ audience: 'partner', templateId: 'partner_approved' }];
    default:
      return [];
  }
}

/**
 * payout.paid routing. Only partner payouts have a Phase-1 template — an affiliate
 * payout produces no notification (this filter used to sit in the use-case).
 */
export function planForPayout(payload: { payeeType: string }): NotificationPlanItem[] {
  return payload.payeeType === 'partner'
    ? [{ audience: 'partner', templateId: 'payout_paid_partner' }]
    : [];
}

/** The T−24h reminder addresses the booking's customer (was hardcoded in the use-case). */
export const REMINDER_PLAN_ITEM: NotificationPlanItem = {
  audience: 'customer',
  templateId: 'booking_reminder_customer',
};
