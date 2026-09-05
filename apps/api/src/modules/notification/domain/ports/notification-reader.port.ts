import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { EmailBrand } from '../email-template';
import type { SubjectKind } from '../tenant-notification-plan';

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
  loadManualRefundBookingContext(
    tx: PrismaTx,
    refundBatchId: string,
  ): Promise<BookingNotificationContext | null>;
  loadListingContext(tx: PrismaTx, listingId: string): Promise<ListingNotificationContext | null>;
  loadPartnerContext(tx: PrismaTx, partnerId: string): Promise<PartnerNotificationContext | null>;
  /**
   * Every member of every `approved` partner in the tenant — `legal.document_published`
   * → `partner_terms` (Task 20). Queried directly against `partners`/`partner_members`
   * (same style as `loadPartnerMembers`), not through the partner module, so this module
   * never imports it.
   */
  loadActivePartnerRecipients(tx: PrismaTx, tenantId: string): Promise<NotificationRecipient[]>;
  /**
   * Every `approved` affiliate in the tenant — `legal.document_published` →
   * `affiliate_terms` (Task 20). Queried directly against `affiliates`, not through the
   * affiliate module.
   */
  loadActiveAffiliateRecipients(tx: PrismaTx, tenantId: string): Promise<NotificationRecipient[]>;
  /** Confirmed bookings whose start falls in [from, to) — the reminder job (cross-tenant, admin pool). */
  findUpcomingConfirmed(from: Date, to: Date): Promise<Array<{ tenantId: string; bookingId: string }>>;
  /**
   * Tenant staff holding `permissionKey` in TENANT scope (partner-scoped
   * assignments are excluded by `partner_id IS NULL`). Queried directly against
   * `role_assignments`/`role_permissions`, exactly as `loadActivePartnerRecipients`
   * queries `partners`/`partner_members` directly — so this module never imports
   * identity-access.
   */
  loadTenantStaffWithPermission(
    tx: PrismaTx, tenantId: string, permissionKey: string,
  ): Promise<NotificationRecipient[]>;

  /**
   * Does this user hold ANY membership in this tenant — staff, partner member,
   * or affiliate? Backs `ResolveNotificationTenantContextGuard`, which must not
   * seed RLS from an unverified `x-tenant-id` header. Runs on the admin pool:
   * it is the check that decides which tenant to scope to, so it cannot itself
   * run inside a tenant-scoped transaction.
   */
  hasTenantMembership(userId: string, tenantId: string): Promise<boolean>;

  /**
   * The `body` line for a tenant notification — WHICH listing, WHICH partner.
   * One read per event, not per recipient. Returns null when the subject was
   * deleted between emit and delivery; the row is still written, just without
   * a subject line.
   */
  loadNotificationSubject(
    tx: PrismaTx, kind: SubjectKind, subjectId: string,
  ): Promise<string | null>;
}
