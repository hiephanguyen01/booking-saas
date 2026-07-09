import type { BookingStatus } from '@booking/shared';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TransitionActor } from '../booking-state-machine';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

export interface BookingRecord {
  id: string;
  tenantId: string;
  listingId: string;
  partnerId: string;
  resourceId: string;
  customerId: string;
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
  securityDeposit: bigint;
  pickedUpAt: Date | null;
  returnedAt: Date | null;
  damageAmount: bigint;
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  /** Promotion applied at checkout (Task 1.11) — null when no code was used. */
  promotionId: string | null;
  customerNote: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * A booking joined with the listing context the partner master calendar needs
 * (Task 1.14 / §21 item 8) — title + listing type for display and filtering.
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
  bookingMode: string;
  startUtc: Date;
  endUtc: Date;
  guestCount: number;
  quantity: number;
  finalAmount: bigint;
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
  customerNote: string | null;
  /** Promotion applied at checkout (Task 1.11) — all null when no code was used. */
  promotionId?: string | null;
  promoCode?: string | null;
  promotionSnapshot?: unknown;
  /** Immutable commission config resolved at booking time (Task 1.10, §13.1). */
  commissionSnapshot?: unknown;
}

/** Inventory fulfillment patch (§9.4) — pickup / return / damage. */
export interface FulfillmentPatch {
  pickedUpAt?: Date;
  returnedAt?: Date;
  damageAmount?: bigint;
  additionalCharges?: unknown;
}

/** Filters for the tenant-side booking overview (Task 1.13). */
export interface TenantBookingFilters {
  status?: BookingStatus;
  partnerId?: string;
  /** Row cap for the overview list (defaults applied in the repository). */
  limit?: number;
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
  findById(tx: PrismaTx, id: string): Promise<BookingRecord | null>;
  findByCode(tx: PrismaTx, code: string): Promise<BookingRecord | null>;
  findByIdempotencyKey(tx: PrismaTx, key: string): Promise<BookingRecord | null>;
  listByCustomer(tx: PrismaTx, customerId: string): Promise<BookingRecord[]>;
  /**
   * All of a partner's bookings whose timeslot overlaps `[from,to)`, joined with
   * listing title + type — the master-calendar feed (Task 1.14). Excludes draft
   * and expired holds (never occupied a slot).
   */
  listForPartnerCalendar(
    tx: PrismaTx,
    partnerId: string,
    from: Date,
    to: Date,
  ): Promise<PartnerCalendarBooking[]>;
  /** Tenant-wide booking list (RLS-scoped by `forTenant`) for the dashboard. */
  listByTenant(tx: PrismaTx, filters: TenantBookingFilters): Promise<BookingRecord[]>;
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
  /** Update inventory fulfillment columns (pickup/return/damage). */
  patchFulfillment(tx: PrismaTx, id: string, patch: FulfillmentPatch): Promise<BookingRecord>;
}
