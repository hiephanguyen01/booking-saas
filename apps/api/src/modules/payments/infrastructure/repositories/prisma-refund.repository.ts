import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RefundHistoryQuery } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  CreateRefundData,
  IRefundRepository,
  RefundRecord,
  RefundHistoryRecord,
  RefundRecoveryRecord,
  MissingRefundRecord,
} from '../../domain/ports/refund-repository.port';

type Row = Prisma.RefundGetPayload<Record<string, never>>;

function toRecord(r: Row): RefundRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    paymentId: r.paymentId,
    bookingId: r.bookingId,
    amount: r.amount,
    status: r.status,
    gatewayRefundId: r.gatewayRefundId,
    reason: r.reason,
    evidence: (r.evidence as RefundRecord['evidence']) ?? null,
  };
}

@Injectable()
export class PrismaRefundRepository implements IRefundRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(tx: PrismaTx, tenantId: string, data: CreateRefundData): Promise<RefundRecord> {
    return toRecord(
      await tx.refund.create({
        data: {
          tenantId,
          paymentId: data.paymentId,
          bookingId: data.bookingId,
          amount: data.amount,
          status: data.status,
          reason: data.reason ?? null,
          gatewayRefundId: data.gatewayRefundId ?? null,
        },
      }),
    );
  }

  async existsForBooking(tx: PrismaTx, bookingId: string, reason: string): Promise<boolean> {
    return (await tx.refund.count({ where: { bookingId, reason } })) > 0;
  }

  async findById(tx: PrismaTx, id: string): Promise<RefundRecord | null> {
    const refund = await tx.refund.findUnique({ where: { id } });
    return refund ? toRecord(refund) : null;
  }

  async markSucceeded(
    tx: PrismaTx,
    id: string,
    evidence: { reference: string; evidenceKey?: string; note?: string },
  ): Promise<RefundRecord | null> {
    const changed = await tx.refund.updateMany({
      where: { id, status: { in: ['pending', 'manual_required'] } },
      data: { status: 'succeeded', evidence },
    });
    if (changed.count === 0) return this.findById(tx, id);
    return this.findById(tx, id);
  }

  async lockForBooking(tx: PrismaTx, bookingId: string): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('refund:' || ${bookingId}))`,
    );
  }

  async list(
    tx: PrismaTx,
    query: RefundHistoryQuery,
  ): Promise<{ items: RefundHistoryRecord[]; total: number }> {
    const where: Prisma.RefundWhereInput = { status: query.status };
    const [rows, total] = await Promise.all([
      tx.refund.findMany({
        where,
        include: { booking: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      tx.refund.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ...toRecord(row),
        bookingCode: row.booking.code,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  async findSucceededNeedingRecovery(limit: number): Promise<RefundRecoveryRecord[]> {
    return this.prisma.admin.$queryRaw<RefundRecoveryRecord[]>(Prisma.sql`
      WITH latest_succeeded AS (
        SELECT DISTINCT ON (booking_id)
          id, tenant_id, payment_id, booking_id, amount, reason, updated_at, created_at
        FROM refunds
        WHERE status = 'succeeded'::refund_status
          AND reason IS DISTINCT FROM 'security_deposit'
        ORDER BY booking_id, updated_at DESC, created_at DESC, id DESC
      )
      SELECT r.id, r.tenant_id AS "tenantId", r.payment_id AS "paymentId",
             r.booking_id AS "bookingId", r.amount, r.reason
      FROM latest_succeeded r
      JOIN bookings b ON b.id = r.booking_id
      LEFT JOIN booking_settlements bs ON bs.booking_id = r.booking_id
      WHERE b.status <> 'refunded'::booking_status
         OR bs.refund_id IS DISTINCT FROM r.id
      ORDER BY r.updated_at
      LIMIT ${limit}`);
  }

  async findBookingsMissingRefund(limit: number): Promise<MissingRefundRecord[]> {
    return this.prisma.admin.$queryRaw<MissingRefundRecord[]>(Prisma.sql`
      WITH missing_refunds AS (
        SELECT b.tenant_id AS "tenantId", b.id AS "bookingId",
               b.refund_due_amount AS amount, b.refund_percent AS "refundPercent",
               'booking_cancellation'::text AS reason, b.updated_at
        FROM bookings b
        WHERE b.status IN ('cancelled', 'refunded')
          AND b.refund_due_amount > 0
          AND EXISTS (
            SELECT 1 FROM payments p
            WHERE p.booking_id = b.id AND p.status = 'succeeded'::payment_status
          )
          AND NOT EXISTS (
            SELECT 1 FROM refunds r
            WHERE r.booking_id = b.id AND r.reason = 'booking_cancellation'
          )

        UNION ALL

        SELECT b.tenant_id AS "tenantId", b.id AS "bookingId",
               b.security_deposit AS amount, NULL::integer AS "refundPercent",
               'security_deposit'::text AS reason, b.updated_at
        FROM bookings b
        WHERE b.status = 'no_show'::booking_status
          AND b.security_deposit > 0
          AND EXISTS (
            SELECT 1 FROM payments p
            WHERE p.booking_id = b.id AND p.status = 'succeeded'::payment_status
          )
          AND NOT EXISTS (
            SELECT 1 FROM refunds r
            WHERE r.booking_id = b.id AND r.reason = 'security_deposit'
          )
      )
      SELECT "tenantId", "bookingId", amount, "refundPercent", reason
      FROM missing_refunds
      ORDER BY updated_at
      LIMIT ${limit}`);
  }
}
