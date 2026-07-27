import type { PaymentHistoryQuery, CheckoutDestination } from '@booking/contracts';
import type { PaymentKind, PaymentStatus } from '@prisma/client';
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
  status: PaymentStatus;
  gatewayOrderRef: string | null;
  gatewayOrderId: string | null;
  gatewayTxnId: string | null;
  paymentMethod: string | null;
  idempotencyKey: string;
  paidAt: Date | null;
}

export interface CreatePaymentData {
  bookingId: string;
  gateway: GatewayKey;
  kind: PaymentKind;
  amount: bigint;
  gatewayTxnId?: string | null;
  gatewayOrderRef?: string | null;
  paymentMethod?: string | null;
  idempotencyKey: string;
  gatewayPayload?: CheckoutGatewayPayload;
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
  status: PaymentStatus;
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
  findLatestByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
  /** Reuse the stored provider handoff on retries/double-clicks. */
  findPendingCheckout(
    tx: PrismaTx,
    bookingId: string,
    paymentMethod: string,
  ): Promise<{ id: string; destination: CheckoutDestination } | null>;
  findSucceededByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
  /** Atomically mark succeeded (only if not already) — the webhook idempotency guard. */
  markSucceeded(
    tx: PrismaTx,
    id: string,
    payload: PaymentCompletionPayload,
    gatewayData?: {
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
  listPlatform(
    query: PaymentHistoryQuery,
  ): Promise<RepoPage<PaymentHistoryRecord>>;
}
