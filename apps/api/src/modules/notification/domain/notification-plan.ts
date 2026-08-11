/**
 * Pure notification routing (TONG-QUAN.md §17). Maps a domain event to the set of
 * {audience, template} it should produce — no framework, no DB, no I/O — so the
 * dispatcher can be unit-tested and the recipient/locale resolution stays in the
 * application layer. Phase 1 is email-only (ZNS is Phase 2).
 */
export type Audience = 'customer' | 'partner' | 'affiliate';

export type NotificationTemplateId =
  | 'legal_document_published_partner'
  | 'legal_document_published_affiliate'
  | 'booking_pending_approval_partner'
  | 'booking_approved_customer'
  | 'booking_confirmed_customer'
  | 'booking_confirmed_partner'
  | 'booking_cancelled_customer'
  | 'booking_cancelled_partner'
  | 'booking_refunded_customer'
  | 'booking_refunded_partner'
  | 'booking_completed_customer'
  | 'booking_auto_completed_partner'
  | 'booking_no_show_customer'
  | 'booking_rejected_customer'
  | 'booking_reminder_customer'
  | 'booking_otp_customer'
  | 'listing_published_partner'
  | 'listing_hidden_partner'
  | 'listing_change_approved_partner'
  | 'listing_change_rejected_partner'
  | 'partner_application_received'
  | 'partner_approved'
  | 'partner_agreement_recorded'
  | 'payout_paid_partner'
  | 'tax_certificate_issued_partner'
  | 'tax_certificate_voided_partner';

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
  'booking.refunded',
];

/** Events routed by listing context. */
export const LISTING_NOTIFICATION_EVENTS: readonly string[] = [
  'listing.published',
  'listing.hidden',
  'listing.revision_approved',
  'listing.revision_rejected',
];

/** Events routed by partner context. */
export const PARTNER_NOTIFICATION_EVENTS: readonly string[] = [
  'partner.applied',
  'partner.approved',
];

/**
 * Events routed by payout context. Rendered with a dedicated dispatcher (needs the
 * amount), not `planForEvent`. OTP is not an event — it is sent synchronously.
 */
export const PAYOUT_NOTIFICATION_EVENTS: readonly string[] = ['payout.paid'];

export const TAX_CERTIFICATE_NOTIFICATION_EVENTS: readonly string[] = [
  'tax.certificate_issued',
  'tax.certificate_voided',
];

/**
 * The audiences + templates for an event. `booking.created` branches on the draft
 * outcome: an approval-gated booking pings the partner to review; a pay-now booking
 * produces no immediate email because confirmation follows successful payment.
 *
 * `booking.completed` branches on `auto`: a partner who pressed the button needs
 * no email about it, but one whose booking the scheduler closed for them does —
 * their payable was computed assuming they collected the outstanding balance on
 * site, and the dispute window is now running.
 */
export function planForEvent(
  eventType: string,
  payload: { status?: string; auto?: boolean },
): NotificationPlanItem[] {
  switch (eventType) {
    case 'booking.created':
      return payload.status === 'pending_approval'
        ? [{ audience: 'partner', templateId: 'booking_pending_approval_partner' }]
        : [];
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
      return payload.auto
        ? [
            { audience: 'customer', templateId: 'booking_completed_customer' },
            { audience: 'partner', templateId: 'booking_auto_completed_partner' },
          ]
        : [{ audience: 'customer', templateId: 'booking_completed_customer' }];
    case 'booking.no_show':
      return [{ audience: 'customer', templateId: 'booking_no_show_customer' }];
    case 'booking.rejected':
      return [{ audience: 'customer', templateId: 'booking_rejected_customer' }];
    case 'booking.refunded':
      return [
        { audience: 'customer', templateId: 'booking_refunded_customer' },
        { audience: 'partner', templateId: 'booking_refunded_partner' },
      ];
    case 'listing.published':
      return [{ audience: 'partner', templateId: 'listing_published_partner' }];
    case 'listing.hidden':
      return [{ audience: 'partner', templateId: 'listing_hidden_partner' }];
    // A parked edit was decided — the partner needs to know their listing changed,
    // or why it did not (§7.3).
    case 'listing.revision_approved':
      return [{ audience: 'partner', templateId: 'listing_change_approved_partner' }];
    case 'listing.revision_rejected':
      return [{ audience: 'partner', templateId: 'listing_change_rejected_partner' }];
    case 'partner.applied':
      return [{ audience: 'partner', templateId: 'partner_application_received' }];
    case 'partner.approved':
      return [
        { audience: 'partner', templateId: 'partner_approved' },
        { audience: 'partner', templateId: 'partner_agreement_recorded' },
      ];
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

/**
 * `legal.document_published` routing (Task 20). The event fires only for a *material*
 * change, so every branch here means "the re-acceptance bar just moved for this
 * audience" — never a cosmetic fix. `partner_terms` addresses the tenant's active
 * partners, `affiliate_terms` its active affiliates.
 *
 * `customer_terms` / `privacy_policy` deliberately return no plan item: a tenant can
 * have thousands of customers, and mailing all of them on every material change does
 * not scale — they are told at their next checkout instead (a notice, not an email).
 * This is an explicit skip, not a gap to "fix" later.
 */
export function planForLegalDocumentPublished(docType: string): NotificationPlanItem[] {
  switch (docType) {
    case 'partner_terms':
      return [{ audience: 'partner', templateId: 'legal_document_published_partner' }];
    case 'affiliate_terms':
      return [{ audience: 'affiliate', templateId: 'legal_document_published_affiliate' }];
    case 'customer_terms':
    case 'privacy_policy':
      return [];
    default:
      return [];
  }
}

/** The T−24h reminder addresses the booking's customer (was hardcoded in the use-case). */
export const REMINDER_PLAN_ITEM: Readonly<NotificationPlanItem> = Object.freeze({
  audience: 'customer',
  templateId: 'booking_reminder_customer',
});
