import type { AttributeField, BookingListingSnapshot, BookingStatus } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { TransitionActor } from '../booking-state-machine';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

/**
 * The booking's customer, joined from `users`. RAW — it carries the real email
 * and the real phone, so it must never be serialised straight onto a partner
 * response; go through the partner mapper (§7.3). `users` is a global (non
 * tenant-scoped) table, so no RLS policy governs this join.
 */
export interface BookingCustomerRecord {
  id: string;
  fullName: string;
  /** `users.phone` is nullable — a guest-checkout row always sets it, a registered account may not. */
  phone: string | null;
  email: string;
}

export interface BookingRecord {
  id: string;
  tenantId: string;
  listingId: string;
  /** Joined from `listings` — every booking surface shows the title, none of them had it. */
  listingTitle: string;
  listingSlug: string;
  listingDescription: string | null;
  listingImageUrl: string | null;
  listingAttributes: unknown;
  listingAttributeSchema: AttributeField[];
  listingCapacity: number | null;
  listingGroup: { title: string; slug: string } | null;
  partnerId: string;
  partnerName: string;
  resourceId: string;
  resourceName: string;
  resourceTimezone: string;
  customerId: string;
  customer: BookingCustomerRecord;
  code: string;
  idempotencyKey: string;
  bookingMode: string;
  status: BookingStatus;
  startUtc: Date;
  endUtc: Date;
  guestCount: number;
  quantity: number;
  totalAmount: bigint;
  discountAmount: bigint;
  finalAmount: bigint;
  depositAmount: bigint;
  paidAmount: bigint;
  refundDueAmount: bigint | null;
  refundPercent: number | null;
  securityDeposit: bigint;
  pickedUpAt: Date | null;
  returnedAt: Date | null;
  damageAmount: bigint;
  /** Overtime/surcharge lines accrued after checkout (§8.3) — jsonb array. */
  additionalCharges: unknown;
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  /** Promotion applied at checkout (Task 1.11) — all null when no code used. */
  promotionId: string | null;
  promoCode: string | null;
  promotionSnapshot: unknown;
  /** Immutable commission config resolved at booking time (Task 1.10, §13.1). */
  commissionSnapshot: unknown;
  /** Frozen checkout quote (§9). */
  pricingSnapshot: unknown;
  listingSnapshot: BookingListingSnapshot;
  /** Affiliate attribution resolved at checkout (§15.1) — null when no referral. */
  affiliateId: string | null;
  referralCode: string | null;
  customerNote: string | null;
  /** Partner's private operational note (§8.2). */
  partnerNote: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A booking joined with the listing context the partner master calendar needs
 * (Task 1.14 / §21 item 8) — title + listing type for display and filtering,
 * plus the customer identity the partner is allowed to see (masked by the mapper).
 */
export interface PartnerCalendarBooking {
  id: string;
  code: string;
  status: BookingStatus;
  listingId: string;
  listingTitle: string;
  listingTypeId: string;
  listingTypeName: string;
  resourceId: string;
  resourceTimezone: string;
  bookingMode: string;
  startUtc: Date;
  endUtc: Date;
  guestCount: number;
  quantity: number;
  customer: BookingCustomerRecord;
  finalAmount: bigint;
  discountAmount: bigint;
  depositAmount: bigint;
  paidAmount: bigint;
  additionalCharges: unknown;
  securityDeposit: bigint;
  pickedUpAt: Date | null;
  returnedAt: Date | null;
  customerNote: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/** One row of `booking_status_history` (§8.2), with the actor's name resolved. */
export interface BookingStatusHistoryRecord {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorId: string | null;
  /** LEFT-joined from `users` — null for system transitions (expiry, auto-complete). */
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface InsertBookingData {
  listingId: string;
  partnerId: string;
  resourceId: string;
  customerId: string;
  code: string;
  idempotencyKey: string;
  bookingMode: string;
  timeslot: { start: Date; end: Date };
  blockedPeriod: { start: Date; end: Date };
  guestCount: number;
  quantity: number;
  totalAmount: bigint;
  discountAmount: bigint;
  finalAmount: bigint;
  depositAmount: bigint;
  securityDeposit: bigint;
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  pricingSnapshot: unknown;
  listingSnapshot: BookingListingSnapshot;
  customerNote: string | null;
  /** Promotion applied at checkout (Task 1.11) — all null when no code used. */
  promotionId?: string | null;
  promoCode?: string | null;
  promotionSnapshot?: unknown;
  /** Immutable commission config resolved at booking time (Task 1.10, §13.1). */
  commissionSnapshot?: unknown;
  /** Affiliate attribution resolved at checkout (§15.1) — null when no referral. */
  affiliateId?: string | null;
  referralCode?: string | null;
}

/** Inventory fulfillment patch (§9.4) — pickup / return / damage. */
export interface FulfillmentPatch {
  pickedUpAt?: Date;
  returnedAt?: Date;
  damageAmount?: bigint;
  additionalCharges?: unknown;
}

export interface FulfillmentGuard {
  expectedStatus: BookingStatus;
  unsetMarker: 'pickedUpAt' | 'returnedAt';
}

/** Filters for the tenant-side booking overview (Task 1.13). */
export interface TenantBookingFilters {
  status?: BookingStatus;
  partnerId?: string;
  /** Case-insensitive search over the booking code + the customer's name / email. */
  q?: string;
  /** Created-at range (inclusive ISO instants). */
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/**
 * Filters for the partner master-calendar feed (Task 1.14). `from`/`to` window the
 * feed by TIMESLOT overlap and are OPTIONAL — both omitted returns every matching
 * booking (unbounded by date). `q` searches the booking code + the customer's
 * name / email; `status` narrows by state.
 */
export interface PartnerCalendarFilters {
  q?: string;
  status?: BookingStatus;
  from?: Date;
  to?: Date;
}

/**
 * Per-partner booking health for the tenant dashboard (Task 1.13, §7.3): counts
 * used to surface a partner's cancellation / no-show rates.
 */
export interface PartnerBookingStat {
  partnerId: string;
  total: number;
  cancelled: number;
  noShow: number;
  completed: number;
  confirmed: number;
}

export interface TransitionParams {
  id: string;
  from: BookingStatus;
  to: BookingStatus;
  actor: TransitionActor;
  actorId?: string | null;
  reason?: string | null;
  /** Optional column patches applied atomically with the status change. */
  expiresAt?: Date | null;
  paidAmount?: bigint;
  refundDueAmount?: bigint;
  refundPercent?: number;
}

export interface RefundIntentParams {
  id: string;
  expectedStatus: 'expired';
  refundDueAmount: bigint;
  refundPercent: number;
}

export interface IBookingRepository {
  /** Insert a `draft` booking (raw SQL — writes timeslot + blocked_period). */
  insertDraft(tx: PrismaTx, tenantId: string, data: InsertBookingData): Promise<BookingRecord>;
  /**
   * Apply a state transition: UPDATE status (+ optional patches) and append a
   * `booking_status_history` row in the same tx. Throws `SlotTakenError` when the
   * exclusion constraint rejects entry into an active state (§10).
   */
  applyTransition(tx: PrismaTx, params: TransitionParams): Promise<BookingRecord>;
  /**
   * Durably record a late-slot refund without changing booking status. The CAS
   * guard prevents a stale webhook from overwriting a later terminal state.
   */
  recordRefundIntent(tx: PrismaTx, params: RefundIntentParams): Promise<BookingRecord>;
  /**
   * Add a balance payment to `paid_amount` (§8.3). Never overwrites — confirmation
   * already SET it to the deposit. Must not double-count a redelivered outbox
   * event; the implementation carries that guard.
   */
  addPaidAmount(tx: PrismaTx, bookingId: string, amount: bigint): Promise<void>;
  findById(tx: PrismaTx, id: string): Promise<BookingRecord | null>;
  findByCode(tx: PrismaTx, code: string): Promise<BookingRecord | null>;
  findByIdempotencyKey(tx: PrismaTx, key: string): Promise<BookingRecord | null>;
  listByCustomer(tx: PrismaTx, customerId: string): Promise<BookingRecord[]>;
  /**
   * A partner's bookings joined with listing title + type — the master-calendar
   * feed (Task 1.14). Excludes draft and expired holds (never occupied a slot).
   * Optionally windowed by timeslot overlap + narrowed by search / status.
   */
  listForPartnerCalendar(
    tx: PrismaTx,
    partnerId: string,
    filters: PartnerCalendarFilters,
  ): Promise<PartnerCalendarBooking[]>;
  /** Tenant-wide booking list (RLS-scoped by `forTenant`) for the dashboard, offset-paginated. */
  listByTenant(tx: PrismaTx, filters: TenantBookingFilters): Promise<RepoPage<BookingRecord>>;
  /** Full transition audit trail for one booking, oldest first (§8.2). */
  listStatusHistory(tx: PrismaTx, bookingId: string): Promise<BookingStatusHistoryRecord[]>;
  /** Set/clear the partner's private note (§8.2). `null` clears it. */
  updatePartnerNote(tx: PrismaTx, id: string, note: string | null): Promise<BookingRecord>;
  /** Aggregate booking counts per partner (RLS-scoped) for cancel/no-show rates. */
  partnerBookingStats(tx: PrismaTx): Promise<PartnerBookingStat[]>;
  /**
   * Take a per-listing advisory lock (serialising concurrent inventory bookings)
   * and return the quantity currently committed for `[from,to)` — active +
   * unreturned rentals, including overdue ones that still block re-rental (§9.4).
   */
  lockAndCountInventory(tx: PrismaTx, listingId: string, from: Date, to: Date): Promise<number>;
  /** Read-only committed quantity for availability (no advisory lock). */
  countInventoryUsage(tx: PrismaTx, listingId: string, from: Date, to: Date): Promise<number>;
  /**
   * CAS update for inventory fulfillment. The status + unset marker are checked
   * by the same SQL statement that writes the patch; a stale caller receives
   * BOOKING_STATE_CHANGED instead of overwriting a newer fulfillment result.
   */
  patchFulfillment(
    tx: PrismaTx,
    id: string,
    patch: FulfillmentPatch,
    guard: FulfillmentGuard,
  ): Promise<BookingRecord>;
}
