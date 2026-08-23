import type {
  CheckoutDestination,
  PaymentHistoryQuery,
  RefundStrategy,
} from '@booking/contracts';
import type { PaymentCheckoutState, PaymentKind, PaymentStatus } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { GatewayKey } from './payment-gateway.port';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface PaymentRecord {
  id: string;
  tenantId: string;
  bookingId: string;
  gateway: GatewayKey;
  kind: PaymentKind;
  amount: bigint;
  capturedAmount: bigint | null;
  status: PaymentStatus;
  checkoutState: PaymentCheckoutState | null;
  gatewayConfigRevisionId: string | null;
  refundStrategySnapshot: RefundStrategy | null;
  manualRefundSlaHoursSnapshot: number | null;
  gatewayOrderRef: string | null;
  gatewayOrderId: string | null;
  gatewayTxnId: string | null;
  paymentMethod: string | null;
  idempotencyKey: string;
  paidAt: Date | null;
  createdAt: Date;
}

export interface CreatePaymentData {
  id?: string;
  bookingId: string;
  gateway: GatewayKey;
  kind: PaymentKind;
  amount: bigint;
  capturedAmount?: bigint | null;
  checkoutState?: PaymentCheckoutState | null;
  gatewayConfigRevisionId?: string | null;
  refundStrategySnapshot?: RefundStrategy | null;
  manualRefundSlaHoursSnapshot?: number | null;
  gatewayTxnId?: string | null;
  gatewayOrderRef?: string | null;
  paymentMethod?: string | null;
  idempotencyKey: string;
  gatewayPayload?: CheckoutGatewayPayload;
}

export interface CreatePendingCheckoutData extends CreatePaymentData {
  id: string;
  checkoutState: 'creating';
  gatewayConfigRevisionId: string | null;
  refundStrategySnapshot: RefundStrategy;
  manualRefundSlaHoursSnapshot: number;
  gatewayOrderRef?: string | null;
}

export interface CheckoutAttemptRecord {
  payment: PaymentRecord;
  destination: CheckoutDestination | null;
}

/** Internal retry signal: regenerate the local attempt before any provider I/O. */
export class CheckoutOrderReferenceCollision extends Error {
  constructor() {
    super('Generated gateway order reference collided with an existing payment');
    this.name = 'CheckoutOrderReferenceCollision';
  }
}

export interface CheckoutGatewayPayload {
  destination: CheckoutDestination;
}

export type PaymentCompletionPayload =
  | {
      event: 'succeeded';
      amountVnd: string;
      gatewayOrderRef: string;
    }
  | { reconciled: true };

/** Minimal cross-tenant view a webhook/reconciliation needs (admin pool). */
export interface PaymentRef {
  id: string;
  tenantId: string;
  bookingId: string;
  gateway: GatewayKey;
  amount: bigint;
  capturedAmount: bigint | null;
  status: PaymentStatus;
  gatewayConfigRevisionId: string | null;
  gatewayTxnId: string | null;
  gatewayOrderRef: string | null;
  /** Recovery-only: the booking is terminal/refunded, so only rebuild finance custody. */
  skipBookingConfirmation?: boolean;
}

export interface PaymentHistoryRecord {
  id: string;
  tenantId: string;
  tenantName: string | null;
  bookingId: string;
  bookingCode: string;
  gateway: GatewayKey;
  paymentMethod: string | null;
  kind: PaymentKind;
  amount: bigint;
  status: PaymentStatus;
  gatewayOrderRef: string | null;
  gatewayTxnId: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface IPaymentRepository {
  create(tx: PrismaTx, tenantId: string, data: CreatePaymentData): Promise<PaymentRecord>;
  findById(tx: PrismaTx, id: string): Promise<PaymentRecord | null>;
  findLatestByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
  /** Serialize creation/reuse for one booking + payment kind + provider-normalized method. */
  lockCheckoutAttempt(
    tx: PrismaTx,
    bookingId: string,
    kind: PaymentKind,
    paymentMethod: string,
  ): Promise<void>;
  /** Reuse a durable pending attempt. `ready` always carries a valid handoff. */
  findReusableCheckoutAttempt(
    tx: PrismaTx,
    bookingId: string,
    kind: PaymentKind,
    paymentMethod: string,
  ): Promise<CheckoutAttemptRecord | null>;
  /** Insert the local attempt before any provider network call. */
  createPendingCheckout(
    tx: PrismaTx,
    tenantId: string,
    data: CreatePendingCheckoutData,
  ): Promise<PaymentRecord>;
  /** Attach provider handoff without downgrading a concurrent financial success. */
  markCheckoutReady(
    tx: PrismaTx,
    paymentId: string,
    data: {
      destination: CheckoutDestination;
      gatewayTxnId?: string | null;
      gatewayOrderRef?: string | null;
      paymentMethod?: string | null;
    },
  ): Promise<boolean>;
  /** Mark only a still-pending create attempt as definitively rejected. */
  markCheckoutCreateFailed(tx: PrismaTx, paymentId: string): Promise<boolean>;
  /** Observe mismatched provider capture while keeping financial status pending. */
  recordCapturedAmountIfPending(tx: PrismaTx, paymentId: string, amount: bigint): Promise<void>;
  /** Reuse the stored provider handoff on legacy retries/double-clicks. */
  findPendingCheckout(
    tx: PrismaTx,
    bookingId: string,
    paymentMethod: string,
  ): Promise<{ id: string; destination: CheckoutDestination } | null>;
  findSucceededByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
  /** All succeeded refundable captures, deterministic newest-first. */
  findSucceededRefundSources(tx: PrismaTx, bookingId: string): Promise<PaymentRecord[]>;
  /** Original successful deposit/full capture used for security-deposit source preservation. */
  findSecurityDepositSource(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
  /** Atomically mark succeeded (only if not already) — the webhook idempotency guard. */
  markSucceeded(
    tx: PrismaTx,
    id: string,
    payload: PaymentCompletionPayload,
    gatewayData: {
      capturedAmount: bigint;
      gatewayTxnId?: string;
      gatewayOrderId?: string;
      paymentMethod?: string;
    },
  ): Promise<boolean>;
  /**
   * Atomically set a terminal `failed`/`expired` status ONLY while still `pending`
   * (§11.2: `succeeded` is terminal — a late/out-of-order failed must not clobber it).
   * Returns whether a row was updated. Mirrors `markSucceeded`'s guarded write.
   */
  markTerminalIfPending(tx: PrismaTx, id: string, status: 'failed' | 'expired'): Promise<boolean>;
  // ── admin pool (cross-tenant; no request context) ──
  findByGatewayReference(gateway: GatewayKey, reference: string): Promise<PaymentRef | null>;
  findStalePending(olderThanSec: number): Promise<PaymentRef[]>;
  /** Succeeded payments whose booking confirmation or held settlement still needs recovery. */
  findSucceededNeedingRecovery(limit: number): Promise<PaymentRef[]>;
  listTenant(
    tx: PrismaTx,
    tenantId: string,
    query: PaymentHistoryQuery,
  ): Promise<RepoPage<PaymentHistoryRecord>>;
  listPlatform(query: PaymentHistoryQuery): Promise<RepoPage<PaymentHistoryRecord>>;
}
