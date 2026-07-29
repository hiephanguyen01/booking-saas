import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { EmailBrand } from '../email-template';

export const NOTIFICATION_READER = Symbol('NOTIFICATION_READER');

/** A resolved recipient — a real user with an email + locale (guests included). */
export interface NotificationRecipient {
  userId: string;
  email: string;
  name: string;
  locale: string;
  phone?: string;
}

export interface BookingNotificationContext {
  bookingId: string;
  code: string;
  status: string;
  listingTitle: string;
  listingImageUrl: string | null;
  tenantName: string;
  partnerName: string;
  providerAddress: string | null;
  providerPhone: string | null;
  bookingMode: string;
  quantity: number;
  startUtc: Date;
  endUtc: Date;
  timezone: string;
  listingAddress: string | null;
  totalAmount: bigint;
  finalAmount: bigint;
  discountAmount: bigint;
  depositAmount: bigint;
  paidAmount: bigint;
  refundedAmount: bigint;
  refundDueAmount: bigint | null;
  refundPercent: number | null;
  pricingSnapshot: unknown;
  paymentGateway: string | null;
  paymentMethod: string | null;
  customerNote: string | null;
  cancellationPolicySnapshot: unknown;
  brand: EmailBrand;
  customer: NotificationRecipient | null;
  partnerRecipients: NotificationRecipient[];
}

export interface ListingNotificationContext {
  listingTitle: string;
  tenantName: string;
  brand: EmailBrand;
  partnerRecipients: NotificationRecipient[];
}

export interface PartnerNotificationContext {
  tenantName: string;
  partnerName: string;
  brand: EmailBrand;
  agreementVersions: string[];
  recipients: NotificationRecipient[];
}

/**
 * Loads the people + data a notification needs. Reads are RLS-scoped through the
 * caller's `forTenant` tx; the User table is global (no tenant_id) so recipient
 * emails/locales resolve on the same tx.
 */
export interface INotificationReader {
  loadBrand(tenantId?: string): Promise<EmailBrand>;
  loadBookingContext(tx: PrismaTx, bookingId: string): Promise<BookingNotificationContext | null>;
  loadListingContext(tx: PrismaTx, listingId: string): Promise<ListingNotificationContext | null>;
  loadPartnerContext(tx: PrismaTx, partnerId: string): Promise<PartnerNotificationContext | null>;
  /** Confirmed bookings whose start falls in [from, to) — the reminder job (cross-tenant, admin pool). */
  findUpcomingConfirmed(from: Date, to: Date): Promise<Array<{ tenantId: string; bookingId: string }>>;
}
