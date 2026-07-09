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
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  customerNote: string | null;
  expiresAt: Date | null;
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
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  pricingSnapshot: unknown;
  customerNote: string | null;
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
}
