import type { PaymentKind, PaymentStatus } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
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
  gatewayTxnId: string | null;
  idempotencyKey: string;
  paidAt: Date | null;
}

export interface CreatePaymentData {
  bookingId: string;
  gateway: GatewayKey;
  kind: PaymentKind;
  amount: bigint;
  gatewayTxnId: string;
  idempotencyKey: string;
  gatewayPayload?: unknown;
}

/** Minimal cross-tenant view a webhook/reconciliation needs (admin pool). */
export interface PaymentRef {
  id: string;
  tenantId: string;
  bookingId: string;
  gateway: GatewayKey;
  amount: bigint;
  status: PaymentStatus;
  gatewayTxnId: string | null;
}

export interface IPaymentRepository {
  create(tx: PrismaTx, tenantId: string, data: CreatePaymentData): Promise<PaymentRecord>;
  findActivePendingByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
  findSucceededByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null>;
  /** Atomically mark succeeded (only if not already) — the webhook idempotency guard. */
  markSucceeded(tx: PrismaTx, id: string, paidAt: Date, payload: unknown): Promise<boolean>;
  updateStatus(tx: PrismaTx, id: string, status: PaymentStatus): Promise<void>;
  // ── admin pool (cross-tenant; no request context) ──
  findByGatewayTxnId(gatewayTxnId: string): Promise<PaymentRef | null>;
  findStalePending(olderThanSec: number): Promise<PaymentRef[]>;
}
