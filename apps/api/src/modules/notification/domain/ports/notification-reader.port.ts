import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const NOTIFICATION_READER = Symbol('NOTIFICATION_READER');

/** A resolved recipient — a real user with an email + locale (guests included). */
export interface NotificationRecipient {
  userId: string;
  email: string;
  name: string;
  locale: string;
}

export interface BookingNotificationContext {
  bookingId: string;
  code: string;
  status: string;
  listingTitle: string;
  tenantName: string;
  partnerName: string;
  startUtc: Date;
  timezone: string;
  finalAmount: bigint;
  customer: NotificationRecipient | null;
  partnerRecipients: NotificationRecipient[];
}

export interface ListingNotificationContext {
  listingTitle: string;
  tenantName: string;
  partnerRecipients: NotificationRecipient[];
}

export interface PartnerNotificationContext {
  tenantName: string;
  partnerName: string;
  recipients: NotificationRecipient[];
}

/**
 * Loads the people + data a notification needs. Reads are RLS-scoped through the
 * caller's `forTenant` tx; the User table is global (no tenant_id) so recipient
 * emails/locales resolve on the same tx.
 */
export interface INotificationReader {
  loadBookingContext(tx: PrismaTx, bookingId: string): Promise<BookingNotificationContext | null>;
  loadListingContext(tx: PrismaTx, listingId: string): Promise<ListingNotificationContext | null>;
  loadPartnerContext(tx: PrismaTx, partnerId: string): Promise<PartnerNotificationContext | null>;
  /** Confirmed bookings whose start falls in [from, to) — the reminder job (cross-tenant, admin pool). */
  findUpcomingConfirmed(from: Date, to: Date): Promise<Array<{ tenantId: string; bookingId: string }>>;
}
