import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  refundEvidenceSchema,
  type ConfirmManualRefundInput,
  type RefundHistoryQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type {
  CreateRefundData,
  IRefundRepository,
  RefundRecord,
  RefundHistoryRecord,
  RefundRecoveryRecord,
  PendingAutomaticRefundRecord,
  MissingRefundRecord,
} from '../../domain/ports/refund-repository.port';
import { pageOffset } from '../../../../shared/pagination/pagination';

type Row = Prisma.RefundGetPayload<Record<string, never>>;

function toRecord(r: Row): RefundRecord {
  const parsedEvidence = r.evidence === null ? null : refundEvidenceSchema.safeParse(r.evidence);
  if (parsedEvidence && !parsedEvidence.success) {
    throw new Error(`Invalid stored refund evidence for refund ${r.id}`);
  }
  return {
    id: r.id,
    tenantId: r.tenantId,
    paymentId: r.paymentId,
    bookingId: r.bookingId,
    amount: r.amount,
    status: r.status,
    gatewayRefundId: r.gatewayRefundId,
    reason: r.reason,
    affectsBookingStatus: r.affectsBookingStatus,
    evidence: parsedEvidence?.data ?? null,
    executionMode: r.executionMode,
    dueAt: r.dueAt,
    completedAt: r.completedAt,
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
          affectsBookingStatus: data.affectsBookingStatus,
          reason: data.reason ?? null,
          gatewayRefundId: data.gatewayRefundId ?? null,
          executionMode: data.executionMode ?? 'manual',
          dueAt: data.dueAt ?? null,
          completedAt: data.status === 'succeeded' ? new Date() : null,
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

  async manualReferenceExists(tx: PrismaTx, tenantId: string, reference: string): Promise<boolean> {
    return (
      (await tx.refund.count({
        where: { tenantId, evidence: { path: ['reference'], equals: reference } },
      })) > 0
    );
  }

  async completeAutomatic(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null> {
    const changed = await tx.refund.updateMany({
      where: { id, status: 'pending', executionMode: 'automatic' },
      data: { status: 'succeeded', gatewayRefundId, completedAt: new Date() },
    });
    if (changed.count === 0) return null;
    return this.findById(tx, id);
  }

  async markAutomaticPending(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null> {
    const changed = await tx.refund.updateMany({
      where: { id, status: 'pending', executionMode: 'automatic' },
      data: { gatewayRefundId },
    });
    if (changed.count === 0) return null;
    return this.findById(tx, id);
  }

  async failAutomatic(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null> {
    const changed = await tx.refund.updateMany({
      where: { id, status: 'pending', executionMode: 'automatic' },
      data: { status: 'failed', gatewayRefundId },
    });
    if (changed.count === 0) return null;
    return this.findById(tx, id);
  }

  async requireManual(tx: PrismaTx, id: string, dueAt: Date): Promise<RefundRecord | null> {
    const changed = await tx.refund.updateMany({
      where: { id, status: 'pending', executionMode: 'automatic' },
      data: { status: 'manual_required', executionMode: 'manual', dueAt },
    });
    if (changed.count === 0) return null;
    return this.findById(tx, id);
  }

  async markSucceeded(
    tx: PrismaTx,
    id: string,
    evidence: ConfirmManualRefundInput,
  ): Promise<RefundRecord | null> {
    const changed = await tx.refund.updateMany({
      where: { id, status: { in: ['pending', 'manual_required'] } },
      data: { status: 'succeeded', evidence, completedAt: new Date() },
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
  ): Promise<RepoPage<RefundHistoryRecord>> {
    const where: Prisma.RefundWhereInput = { status: query.status };
    const { skip, take } = pageOffset(query);
    const [rows, total] = await Promise.all([
      tx.refund.findMany({
        where,
        include: { booking: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
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

  async findPendingAutomatic(limit: number): Promise<PendingAutomaticRefundRecord[]> {
    return this.prisma.admin.$queryRaw<PendingAutomaticRefundRecord[]>(Prisma.sql`
      SELECT id, tenant_id AS "tenantId"
      FROM refunds
      WHERE status = 'pending'::refund_status
        AND execution_mode = 'automatic'::refund_execution_mode
      ORDER BY updated_at, created_at, id
      LIMIT ${limit}`);
  }

  async findSucceededNeedingRecovery(limit: number): Promise<RefundRecoveryRecord[]> {
    return this.prisma.admin.$queryRaw<RefundRecoveryRecord[]>(Prisma.sql`
      WITH latest_succeeded AS (
        SELECT DISTINCT ON (booking_id)
          id, tenant_id, payment_id, booking_id, amount, reason,
          affects_booking_status, updated_at, created_at
        FROM refunds
        WHERE status = 'succeeded'::refund_status
          AND reason IS DISTINCT FROM 'security_deposit'
        ORDER BY booking_id, updated_at DESC, created_at DESC, id DESC
      )
      SELECT r.id, r.tenant_id AS "tenantId", r.payment_id AS "paymentId",
             r.booking_id AS "bookingId", r.amount, r.reason,
             r.affects_booking_status AS "affectsBookingStatus"
      FROM latest_succeeded r
      JOIN bookings b ON b.id = r.booking_id
      LEFT JOIN booking_settlements bs ON bs.booking_id = r.booking_id
      WHERE (r.affects_booking_status AND b.status <> 'refunded'::booking_status)
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