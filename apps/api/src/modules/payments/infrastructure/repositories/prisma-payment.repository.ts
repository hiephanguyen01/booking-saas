import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  checkoutDestinationSchema,
  type CheckoutDestination,
  type PaymentHistoryQuery,
} from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
import {
  CheckoutOrderReferenceCollision,
  type CheckoutAttemptRecord,
  type CreatePaymentData,
  type CreatePendingCheckoutData,
  type IPaymentRepository,
  type PaymentCompletionPayload,
  type PaymentHistoryRecord,
  type PaymentRecord,
  type PaymentRef,
} from '../../domain/ports/payment-repository.port';
import { pageOffset } from '../../../../shared/pagination/pagination';

type Row = Prisma.PaymentGetPayload<Record<string, never>>;

function toRecord(p: Row): PaymentRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    bookingId: p.bookingId,
    gateway: p.gateway as GatewayKey,
    kind: p.kind,
    amount: p.amount,
    capturedAmount: p.capturedAmount,
    status: p.status,
    checkoutState: p.checkoutState,
    gatewayConfigRevisionId: p.gatewayConfigRevisionId,
    refundStrategySnapshot: p.refundStrategySnapshot as PaymentRecord['refundStrategySnapshot'],
    manualRefundSlaHoursSnapshot: p.manualRefundSlaHoursSnapshot,
    gatewayOrderRef: p.gatewayOrderRef,
    gatewayOrderId: p.gatewayOrderId,
    gatewayTxnId: p.gatewayTxnId,
    paymentMethod: p.paymentMethod,
    idempotencyKey: p.idempotencyKey,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  };
}

function destinationFromPayload(payload: Prisma.JsonValue | null): CheckoutDestination | null {
  const candidate =
    payload && typeof payload === 'object' && !Array.isArray(payload) && 'destination' in payload
      ? payload.destination
      : payload &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          'paymentUrl' in payload
        ? { type: 'redirect', paymentUrl: payload.paymentUrl }
        : null;
  const parsed = checkoutDestinationSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function isGatewayOrderReferenceCollision(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') {
    return false;
  }
  const meta = 'meta' in error && error.meta && typeof error.meta === 'object' ? error.meta : null;
  const target = meta && 'target' in meta ? meta.target : null;
  const normalized = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return (
    normalized.includes('gateway_order_ref') ||
    normalized.includes('gatewayOrderRef') ||
    normalized.includes('payments_gateway_gateway_order_ref_key')
  );
}

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: PrismaTx, tenantId: string, data: CreatePaymentData): Promise<PaymentRecord> {
    return toRecord(
      await tx.payment.create({
        data: {
          id: data.id,
          tenantId,
          bookingId: data.bookingId,
          gateway: data.gateway,
          kind: data.kind,
          amount: data.amount,
          capturedAmount: data.capturedAmount,
          checkoutState: data.checkoutState,
          gatewayConfigRevisionId: data.gatewayConfigRevisionId,
          refundStrategySnapshot: data.refundStrategySnapshot,
          manualRefundSlaHoursSnapshot: data.manualRefundSlaHoursSnapshot,
          gatewayOrderRef: data.gatewayOrderRef,
          gatewayTxnId: data.gatewayTxnId,
          paymentMethod: data.paymentMethod,
          idempotencyKey: data.idempotencyKey,
          gatewayPayload: data.gatewayPayload as Prisma.InputJsonValue | undefined,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<PaymentRecord | null> {
    const payment = await tx.payment.findUnique({ where: { id } });
    return payment ? toRecord(payment) : null;
  }

  async findLatestByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null> {
    const payment = await tx.payment.findFirst({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });
    return payment ? toRecord(payment) : null;
  }

  async lockCheckoutAttempt(
    tx: PrismaTx,
    bookingId: string,
    kind: PaymentRecord['kind'],
    paymentMethod: string,
  ): Promise<void> {
    const key = `payment-checkout:${bookingId}:${kind}:${paymentMethod}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }

  async findReusableCheckoutAttempt(
    tx: PrismaTx,
    bookingId: string,
    kind: PaymentRecord['kind'],
    paymentMethod: string,
  ): Promise<CheckoutAttemptRecord | null> {
    const payment = await tx.payment.findFirst({
      where: {
        bookingId,
        kind,
        status: 'pending',
        paymentMethod,
        checkoutState: { in: ['creating', 'ready'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) return null;
    const destination = destinationFromPayload(payment.gatewayPayload);
    if (payment.checkoutState === 'ready' && !destination) {
      throw new Error(`Ready checkout payment ${payment.id} is missing a valid destination`);
    }
    return { payment: toRecord(payment), destination };
  }

  async createPendingCheckout(
    tx: PrismaTx,
    tenantId: string,
    data: CreatePendingCheckoutData,
  ): Promise<PaymentRecord> {
    try {
      return await this.create(tx, tenantId, data);
    } catch (error) {
      if (isGatewayOrderReferenceCollision(error)) {
        throw new CheckoutOrderReferenceCollision();
      }
      throw error;
    }
  }

  async markCheckoutReady(
    tx: PrismaTx,
    paymentId: string,
    data: {
      destination: CheckoutDestination;
      gatewayTxnId?: string | null;
      gatewayOrderRef?: string | null;
      paymentMethod?: string | null;
    },
  ): Promise<boolean> {
    const gatewayTxnId = data.gatewayTxnId ?? null;
    const gatewayOrderRef = data.gatewayOrderRef ?? null;
    const paymentMethod = data.paymentMethod ?? null;
    const destinationPayload = JSON.stringify({ destination: data.destination });
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE payments
      SET checkout_state = 'ready',
          gateway_txn_id = COALESCE(${gatewayTxnId}, gateway_txn_id),
          gateway_order_ref = COALESCE(${gatewayOrderRef}, gateway_order_ref),
          payment_method = COALESCE(${paymentMethod}, payment_method),
          gateway_payload = COALESCE(gateway_payload, '{}'::jsonb) || ${destinationPayload}::jsonb,
          updated_at = now()
      WHERE id = ${paymentId}::uuid
        AND status IN ('pending', 'succeeded')
        AND checkout_state IN ('creating', 'ready')`);
    return affected > 0;
  }

  async markCheckoutCreateFailed(tx: PrismaTx, paymentId: string): Promise<boolean> {
    const result = await tx.payment.updateMany({
      where: { id: paymentId, status: 'pending', checkoutState: { in: ['creating', 'ready'] } },
      data: { checkoutState: 'create_failed' },
    });
    return result.count > 0;
  }

  async recordCapturedAmountIfPending(
    tx: PrismaTx,
    paymentId: string,
    amount: bigint,
  ): Promise<void> {
    await tx.payment.updateMany({
      where: { id: paymentId, status: 'pending' },
      data: { capturedAmount: amount },
    });
  }

  async findPendingCheckout(
    tx: PrismaTx,
    bookingId: string,
    paymentMethod: string,
  ): Promise<{ id: string; destination: CheckoutDestination } | null> {
    const payment = await tx.payment.findFirst({
      where: { bookingId, status: 'pending', paymentMethod },
      select: { id: true, gatewayPayload: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) return null;
    const destination = destinationFromPayload(payment.gatewayPayload);
    return destination ? { id: payment.id, destination } : null;
  }

  async findSucceededByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null> {
    const p = await tx.payment.findFirst({
      where: { bookingId, status: 'succeeded' },
      orderBy: { createdAt: 'desc' },
    });
    return p ? toRecord(p) : null;
  }

  async findSucceededRefundSources(tx: PrismaTx, bookingId: string): Promise<PaymentRecord[]> {
    const rows = await tx.payment.findMany({
      where: { bookingId, status: 'succeeded' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async findSecurityDepositSource(
    tx: PrismaTx,
    bookingId: string,
  ): Promise<PaymentRecord | null> {
    const payment = await tx.payment.findFirst({
      where: { bookingId, status: 'succeeded', kind: { in: ['deposit', 'full'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return payment ? toRecord(payment) : null;
  }

  /** Atomic: only the first concurrent webhook flips pending → succeeded (§11.2). */
  async markSucceeded(
    tx: PrismaTx,
    id: string,
    payload: PaymentCompletionPayload,
    gatewayData: {
      capturedAmount: bigint;
      gatewayTxnId?: string;
      gatewayOrderId?: string;
      paymentMethod?: string;
    },
  ): Promise<boolean> {
    const gatewayTxnId = gatewayData.gatewayTxnId ?? null;
    const gatewayOrderId = gatewayData.gatewayOrderId ?? null;
    const paymentMethod = gatewayData.paymentMethod ?? null;
    const completionPayload = JSON.stringify(payload ?? {});
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE payments
      SET status = 'succeeded', paid_at = now(), captured_amount = ${gatewayData.capturedAmount},
          gateway_txn_id = COALESCE(${gatewayTxnId}, gateway_txn_id),
          gateway_order_id = COALESCE(${gatewayOrderId}, gateway_order_id),
          payment_method = COALESCE(${paymentMethod}, payment_method),
          gateway_payload = COALESCE(gateway_payload, '{}'::jsonb) || ${completionPayload}::jsonb,
          updated_at = now()
      WHERE id = ${id}::uuid AND status = 'pending'`);
    return affected > 0;
  }

  /** Atomic guarded write: the UPDATE ... WHERE status = 'pending' is a single
   * statement, so a concurrent succeeded delivery is never clobbered (§11.2). */
  async markTerminalIfPending(
    tx: PrismaTx,
    id: string,
    status: 'failed' | 'expired',
  ): Promise<boolean> {
    const res = await tx.payment.updateMany({ where: { id, status: 'pending' }, data: { status } });
    return res.count > 0;
  }

  async findByGatewayReference(gateway: GatewayKey, reference: string): Promise<PaymentRef | null> {
    const p = await this.prisma.admin.payment.findFirst({
      where: {
        gateway,
        OR: [{ gatewayOrderRef: reference }, { gatewayTxnId: reference }],
      },
    });
    return p ? this.toRef(p) : null;
  }

  async findStalePending(olderThanSec: number): Promise<PaymentRef[]> {
    // DB clock, not Date.now() — app/DB clock skew must not make a fresh payment
    // invisible or a young one look stale (same discipline as the outbox relay).
    const rows = await this.prisma.admin.$queryRaw<
      {
        id: string;
        tenantId: string;
        bookingId: string;
        gateway: string;
        amount: bigint;
        capturedAmount: bigint | null;
        status: string;
        gatewayConfigRevisionId: string | null;
        gatewayTxnId: string | null;
        gatewayOrderRef: string | null;
      }[]
    >(Prisma.sql`
      SELECT id, tenant_id AS "tenantId", booking_id AS "bookingId", gateway::text AS "gateway",
             amount, captured_amount AS "capturedAmount", status::text AS "status",
             gateway_config_revision_id AS "gatewayConfigRevisionId",
             gateway_txn_id AS "gatewayTxnId", gateway_order_ref AS "gatewayOrderRef"
      FROM payments
      WHERE status = 'pending' AND created_at < now() - make_interval(secs => ${olderThanSec})
      ORDER BY created_at LIMIT 100`);
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      bookingId: r.bookingId,
      gateway: r.gateway as GatewayKey,
      amount: r.amount,
      capturedAmount: r.capturedAmount,
      status: r.status as PaymentRef['status'],
      gatewayConfigRevisionId: r.gatewayConfigRevisionId,
      gatewayTxnId: r.gatewayTxnId,
      gatewayOrderRef: r.gatewayOrderRef,
    }));
  }

  async findSucceededNeedingRecovery(limit: number): Promise<PaymentRef[]> {
    const rows = await this.prisma.admin.$queryRaw<
      Array<{
        id: string;
        tenantId: string;
        bookingId: string;
        gateway: string;
        amount: bigint;
        capturedAmount: bigint | null;
        status: string;
        gatewayConfigRevisionId: string | null;
        gatewayTxnId: string | null;
        gatewayOrderRef: string | null;
        skipBookingConfirmation: boolean;
      }>
    >(Prisma.sql`
      SELECT p.id, p.tenant_id AS "tenantId", p.booking_id AS "bookingId",
             p.gateway::text AS gateway, p.amount, p.captured_amount AS "capturedAmount",
             p.status::text AS status,
             p.gateway_config_revision_id AS "gatewayConfigRevisionId",
             p.gateway_txn_id AS "gatewayTxnId", p.gateway_order_ref AS "gatewayOrderRef",
             (b.status IN ('cancelled', 'refunded') OR EXISTS (
                SELECT 1 FROM refunds r
                WHERE r.booking_id = b.id
                  AND r.refund_batch_id IS NULL
                  AND r.status = 'succeeded'::refund_status
                  AND r.reason <> 'security_deposit'
              ) OR EXISTS (
                SELECT 1 FROM refund_batches rb
                WHERE rb.booking_id = b.id
                  AND rb.status = 'completed'::refund_batch_status
                  AND rb.affects_booking_status = true
              )) AS "skipBookingConfirmation"
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN booking_settlements bs ON bs.payment_id = p.id
      WHERE p.status = 'succeeded'
        AND (
          (b.status IN ('pending_payment', 'expired') AND NOT EXISTS (
            SELECT 1 FROM refunds r
            WHERE r.booking_id = b.id
              AND r.refund_batch_id IS NULL
              AND r.status = 'succeeded'::refund_status
              AND r.reason <> 'security_deposit'
          ) AND NOT EXISTS (
            SELECT 1 FROM refund_batches rb
            WHERE rb.booking_id = b.id
              AND rb.status = 'completed'::refund_batch_status
              AND rb.affects_booking_status = true
          ))
          OR bs.id IS NULL
        )
      ORDER BY p.paid_at NULLS LAST, p.created_at
      LIMIT ${limit}`);
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      bookingId: r.bookingId,
      gateway: r.gateway as GatewayKey,
      amount: r.amount,
      capturedAmount: r.capturedAmount,
      status: r.status as PaymentRef['status'],
      gatewayConfigRevisionId: r.gatewayConfigRevisionId,
      gatewayTxnId: r.gatewayTxnId,
      gatewayOrderRef: r.gatewayOrderRef,
      skipBookingConfirmation: r.skipBookingConfirmation,
    }));
  }

  async listTenant(
    tx: PrismaTx,
    tenantId: string,
    query: PaymentHistoryQuery,
  ): Promise<RepoPage<PaymentHistoryRecord>> {
    const where = this.historyWhere(query, tenantId);
    const { skip, take } = pageOffset(query);
    const [rows, total] = await Promise.all([
      tx.payment.findMany({
        where,
        include: { booking: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      tx.payment.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ...this.toHistoryBase(row, row.booking.code),
        tenantName: null,
      })),
      total,
    };
  }

  async listPlatform(query: PaymentHistoryQuery): Promise<RepoPage<PaymentHistoryRecord>> {
    const where = this.historyWhere(query);
    const { skip, take } = pageOffset(query);
    const [rows, total] = await Promise.all([
      this.prisma.admin.payment.findMany({
        where,
        include: {
          booking: { select: { code: true } },
          tenant: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.admin.payment.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ...this.toHistoryBase(row, row.booking.code),
        tenantName: row.tenant.name,
      })),
      total,
    };
  }

  private historyWhere(query: PaymentHistoryQuery, tenantId?: string): Prisma.PaymentWhereInput {
    const search = query.search?.trim();
    return {
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { booking: { code: { contains: search, mode: 'insensitive' } } },
              { gatewayOrderRef: { contains: search, mode: 'insensitive' } },
              { gatewayTxnId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private toHistoryBase(row: Row, bookingCode: string): Omit<PaymentHistoryRecord, 'tenantName'> {
    return {
      id: row.id,
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      bookingCode,
      gateway: row.gateway as GatewayKey,
      paymentMethod: row.paymentMethod,
      kind: row.kind,
      amount: row.amount,
      status: row.status,
      gatewayOrderRef: row.gatewayOrderRef,
      gatewayTxnId: row.gatewayTxnId,
      paidAt: row.paidAt,
      createdAt: row.createdAt,
    };
  }

  private toRef(p: Row): PaymentRef {
    return {
      id: p.id,
      tenantId: p.tenantId,
      bookingId: p.bookingId,
      gateway: p.gateway as GatewayKey,
      amount: p.amount,
      capturedAmount: p.capturedAmount,
      status: p.status,
      gatewayConfigRevisionId: p.gatewayConfigRevisionId,
      gatewayTxnId: p.gatewayTxnId,
      gatewayOrderRef: p.gatewayOrderRef,
    };
  }
}
