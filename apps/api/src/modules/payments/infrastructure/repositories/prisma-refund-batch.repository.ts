import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { RefundBatch } from '../../domain/entities/refund-batch.entity';
import type { RefundBatchState } from '../../domain/entities/refund-batch.entity';
import type {
  IRefundBatchRepository,
  RefreshRefundBatchResult,
  RefundBatchRecord,
} from '../../domain/ports/refund-batch-repository.port';

type Row = Prisma.RefundBatchGetPayload<Record<string, never>>;

function toRecord(row: Row): RefundBatchRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    bookingId: row.bookingId,
    requestedAmount: row.requestedAmount,
    reason: row.reason,
    affectsBookingStatus: row.affectsBookingStatus,
    status: row.status as RefundBatchState,
    completedAt: row.completedAt,
  };
}

@Injectable()
export class PrismaRefundBatchRepository implements IRefundBatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByBookingReason(
    tx: PrismaTx,
    bookingId: string,
    reason: string,
  ): Promise<RefundBatchRecord | null> {
    const row = await tx.refundBatch.findFirst({ where: { bookingId, reason } });
    return row ? toRecord(row) : null;
  }

  async create(
    tx: PrismaTx,
    tenantId: string,
    data: {
      bookingId: string;
      requestedAmount: bigint;
      reason: string;
      affectsBookingStatus: boolean;
    },
  ): Promise<RefundBatchRecord> {
    return toRecord(
      await tx.refundBatch.create({
        data: { tenantId, ...data },
      }),
    );
  }

  async refreshStatus(
    tx: PrismaTx,
    batchId: string,
  ): Promise<RefreshRefundBatchResult | null> {
    const batch = await tx.refundBatch.findUnique({ where: { id: batchId } });
    if (!batch) return null;
    const children = await tx.refund.findMany({
      where: { refundBatchId: batchId },
      select: { amount: true, status: true },
    });
    const next = RefundBatch.classify(batch.requestedAmount, children);

    if (next === 'completed') {
      const changed = await tx.refundBatch.updateMany({
        where: { id: batchId, status: { not: 'completed' } },
        data: { status: 'completed', completedAt: new Date() },
      });
      const current = await tx.refundBatch.findUnique({ where: { id: batchId } });
      if (!current) return null;
      return { batch: toRecord(current), transitionedToCompleted: changed.count === 1 };
    }

    if (batch.status !== 'completed' && batch.status !== next) {
      await tx.refundBatch.updateMany({
        where: { id: batchId, status: { not: 'completed' } },
        data: { status: next },
      });
    }
    const current = await tx.refundBatch.findUnique({ where: { id: batchId } });
    if (!current) return null;
    return { batch: toRecord(current), transitionedToCompleted: false };
  }

  async findCompletedNeedingRecovery(limit: number): Promise<RefundBatchRecord[]> {
    const rows = await this.prisma.admin.$queryRaw<
      Array<{
        id: string;
        tenantId: string;
        bookingId: string;
        requestedAmount: bigint;
        reason: string;
        affectsBookingStatus: boolean;
        status: RefundBatchState;
        completedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT rb.id, rb.tenant_id AS "tenantId", rb.booking_id AS "bookingId",
             rb.requested_amount AS "requestedAmount", rb.reason,
             rb.affects_booking_status AS "affectsBookingStatus",
             rb.status::text AS status, rb.completed_at AS "completedAt"
      FROM refund_batches rb
      JOIN bookings b ON b.id = rb.booking_id
      LEFT JOIN booking_settlements bs ON bs.booking_id = rb.booking_id
      WHERE rb.status = 'completed'::refund_batch_status
        AND (
          (
            rb.affects_booking_status = true
            AND (
              b.status <> 'refunded'::booking_status
              OR bs.refund_id IS DISTINCT FROM rb.id
            )
          )
          OR (
            rb.reason = 'dispute_refund'
            AND bs.refund_id IS DISTINCT FROM rb.id
          )
        )
      ORDER BY rb.updated_at, rb.id
      LIMIT ${limit}`);
    return rows;
  }
}
