import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
import type {
  CreatePaymentData,
  IPaymentRepository,
  PaymentRecord,
  PaymentRef,
} from '../../domain/ports/payment-repository.port';

type Row = Prisma.PaymentGetPayload<Record<string, never>>;

function toRecord(p: Row): PaymentRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    bookingId: p.bookingId,
    gateway: p.gateway as GatewayKey,
    kind: p.kind,
    amount: p.amount,
    status: p.status,
    gatewayTxnId: p.gatewayTxnId,
    idempotencyKey: p.idempotencyKey,
    paidAt: p.paidAt,
  };
}

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: PrismaTx, tenantId: string, data: CreatePaymentData): Promise<PaymentRecord> {
    return toRecord(
      await tx.payment.create({
        data: {
          tenantId,
          bookingId: data.bookingId,
          gateway: data.gateway,
          kind: data.kind,
          amount: data.amount,
          gatewayTxnId: data.gatewayTxnId,
          idempotencyKey: data.idempotencyKey,
          gatewayPayload: (data.gatewayPayload ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      }),
    );
  }

  async findActivePendingByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null> {
    const p = await tx.payment.findFirst({ where: { bookingId, status: 'pending' }, orderBy: { createdAt: 'desc' } });
    return p ? toRecord(p) : null;
  }

  async findLatestByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null> {
    const payment = await tx.payment.findFirst({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });
    return payment ? toRecord(payment) : null;
  }

  async findPendingCheckout(tx: PrismaTx, bookingId: string): Promise<{ id: string; paymentUrl: string } | null> {
    const rows = await tx.$queryRaw<{ id: string; paymentUrl: string | null }[]>(Prisma.sql`
      SELECT id, gateway_payload->>'paymentUrl' AS "paymentUrl"
      FROM payments WHERE booking_id = ${bookingId}::uuid AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1`);
    const r = rows[0];
    return r?.paymentUrl ? { id: r.id, paymentUrl: r.paymentUrl } : null;
  }

  async findSucceededByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null> {
    const p = await tx.payment.findFirst({ where: { bookingId, status: 'succeeded' }, orderBy: { createdAt: 'desc' } });
    return p ? toRecord(p) : null;
  }

  /** Atomic: only the first concurrent webhook flips pending → succeeded (§11.2). */
  async markSucceeded(tx: PrismaTx, id: string, paidAt: Date, payload: unknown): Promise<boolean> {
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE payments
      SET status = 'succeeded', paid_at = ${paidAt}, gateway_payload = ${JSON.stringify(payload ?? null)}::jsonb, updated_at = now()
      WHERE id = ${id}::uuid AND status <> 'succeeded'`);
    return affected > 0;
  }

  /** Atomic guarded write: the UPDATE ... WHERE status = 'pending' is a single
   * statement, so a concurrent succeeded delivery is never clobbered (§11.2). */
  async markTerminalIfPending(tx: PrismaTx, id: string, status: 'failed' | 'expired'): Promise<boolean> {
    const res = await tx.payment.updateMany({ where: { id, status: 'pending' }, data: { status } });
    return res.count > 0;
  }

  async findByGatewayTxnId(gatewayTxnId: string): Promise<PaymentRef | null> {
    const p = await this.prisma.admin.payment.findFirst({ where: { gatewayTxnId } });
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
        status: string;
        gatewayTxnId: string | null;
      }[]
    >(Prisma.sql`
      SELECT id, tenant_id AS "tenantId", booking_id AS "bookingId", gateway::text AS "gateway",
             amount, status::text AS "status", gateway_txn_id AS "gatewayTxnId"
      FROM payments
      WHERE status = 'pending' AND created_at < now() - make_interval(secs => ${olderThanSec})
      ORDER BY created_at LIMIT 100`);
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      bookingId: r.bookingId,
      gateway: r.gateway as GatewayKey,
      amount: r.amount,
      status: r.status as PaymentRef['status'],
      gatewayTxnId: r.gatewayTxnId,
    }));
  }

  private toRef(p: Row): PaymentRef {
    return {
      id: p.id,
      tenantId: p.tenantId,
      bookingId: p.bookingId,
      gateway: p.gateway as GatewayKey,
      amount: p.amount,
      status: p.status,
      gatewayTxnId: p.gatewayTxnId,
    };
  }
}
