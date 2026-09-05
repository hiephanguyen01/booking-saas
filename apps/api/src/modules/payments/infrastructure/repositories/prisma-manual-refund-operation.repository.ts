import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  ManualRefundBatchTenantMismatch,
  ManualRefundTransferReferenceAlreadyUsed,
} from '../../domain/errors/manual-refund-errors';
import { normalizeManualRefundTransferReference } from '../../domain/manual-refund-transfer-reference';
import type {
  IManualRefundOperationRepository,
  ManualRefundOperationPatch,
  ManualRefundOperationRecord,
  ManualRefundOperationViewRecord,
} from '../../domain/ports/manual-refund-operation-repository.port';
import type { ManualRefundListQuery } from '@booking/contracts';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import { pageOffset } from '../../../../shared/pagination/pagination';

type Row = Prisma.ManualRefundOperationGetPayload<Record<string, never>>;

function toRecord(row: Row): ManualRefundOperationRecord {
  return {
    ...row,
    status: row.status,
    verificationResult: row.verificationResult as ManualRefundOperationRecord['verificationResult'],
    verificationMethod: row.verificationMethod as ManualRefundOperationRecord['verificationMethod'],
    customerAcknowledgement:
      row.customerAcknowledgement as ManualRefundOperationRecord['customerAcknowledgement'],
  };
}

@Injectable()
export class PrismaManualRefundOperationRepository implements IManualRefundOperationRepository {
  constructor(private readonly prisma: PrismaService) {}
  async isWorkflowEnabled(tx: PrismaTx, tenantId: string): Promise<boolean> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant || !tenant.settings || typeof tenant.settings !== 'object') return false;
    return (tenant.settings as Record<string, unknown>).manual_refund_v2 === true;
  }

  async createForBatch(tx: PrismaTx, tenantId: string, refundBatchId: string): Promise<void> {
    const batch = await tx.refundBatch.findFirst({
      where: { id: refundBatchId, tenantId },
      select: { id: true },
    });
    if (!batch) throw new ManualRefundBatchTenantMismatch();
    await tx.manualRefundOperation.upsert({
      where: { refundBatchId, tenantId },
      create: { tenantId, refundBatchId },
      update: {},
    });
  }

  async findCustomerDetailReminderCandidates(limit: number) {
    return this.prisma.admin.$queryRaw<
      Array<{ tenantId: string; operationId: string; hours: 24 | 48 }>
    >(Prisma.sql`
      SELECT tenant_id AS "tenantId", id AS "operationId",
             CASE WHEN customer_detail_reminder_24_at IS NULL THEN 24 ELSE 48 END AS hours
      FROM manual_refund_operations
      WHERE status = 'awaiting_details'
        AND (
          (customer_detail_reminder_24_at IS NULL AND COALESCE(reopened_at, created_at) <= now() - interval '24 hours')
          OR (customer_detail_reminder_24_at IS NOT NULL AND customer_detail_reminder_48_at IS NULL AND COALESCE(reopened_at, created_at) <= now() - interval '48 hours')
        )
      ORDER BY COALESCE(reopened_at, created_at), id
      LIMIT ${limit}`);
  }

  async findTransferSlaCandidates(limit: number) {
    return this.prisma.admin.$queryRaw<
      Array<{ tenantId: string; operationId: string; slaHours: number }>
    >(Prisma.sql`
      SELECT m.tenant_id AS "tenantId", m.id AS "operationId",
             COALESCE(MIN(p.manual_refund_sla_hours_snapshot), 72)::int AS "slaHours"
      FROM manual_refund_operations m
      JOIN refunds r ON r.refund_batch_id = m.refund_batch_id
      JOIN payments p ON p.id = r.payment_id
      WHERE m.status = 'ready_for_transfer' AND m.ready_at IS NOT NULL AND m.transfer_due_at IS NULL
      GROUP BY m.tenant_id, m.id
      ORDER BY m.ready_at, m.id
      LIMIT ${limit}`);
  }

  async findCheckerEscalationCandidates(limit: number) {
    return this.prisma.admin.$queryRaw<Array<{ tenantId: string; operationId: string }>>(Prisma.sql`
      SELECT tenant_id AS "tenantId", id AS "operationId"
      FROM manual_refund_operations
      WHERE status = 'transfer_submitted'
        AND transfer_submitted_at <= now() - interval '24 hours'
        AND checker_escalated_at IS NULL
      ORDER BY transfer_submitted_at, id
      LIMIT ${limit}`);
  }

  async findCiphertextPurgeCandidates(limit: number) {
    return this.prisma.admin.$queryRaw<Array<{ tenantId: string; operationId: string }>>(Prisma.sql`
      SELECT tenant_id AS "tenantId", id AS "operationId"
      FROM manual_refund_operations
      WHERE status = 'completed'
        AND completed_at <= now() - interval '90 days'
        AND ciphertext_purged_at IS NULL
        AND destination_account_ciphertext IS NOT NULL
      ORDER BY completed_at, id
      LIMIT ${limit}`);
  }

  async purgeCiphertext(
    tx: PrismaTx,
    tenantId: string,
    operationId: string,
    expectedVersion: number,
    eligibleBefore: Date,
    purgedAt: Date,
  ): Promise<boolean> {
    const changed = await tx.manualRefundOperation.updateMany({
      where: {
        id: operationId,
        tenantId,
        status: 'completed',
        version: expectedVersion,
        completedAt: { lte: eligibleBefore },
        ciphertextPurgedAt: null,
        destinationAccountCiphertext: { not: null },
      },
      data: {
        destinationAccountCiphertext: null,
        destinationEncryptionKeyVersion: null,
        ciphertextPurgedAt: purgedAt,
        version: { increment: 1 },
      },
    });
    return changed.count === 1;
  }

  async findById(
    tx: PrismaTx,
    tenantId: string,
    id: string,
  ): Promise<ManualRefundOperationRecord | null> {
    const row = await tx.manualRefundOperation.findUnique({ where: { id, tenantId } });
    return row ? toRecord(row) : null;
  }

  async findByBatchId(
    tx: PrismaTx,
    tenantId: string,
    refundBatchId: string,
  ): Promise<ManualRefundOperationRecord | null> {
    const row = await tx.manualRefundOperation.findUnique({ where: { refundBatchId, tenantId } });
    return row ? toRecord(row) : null;
  }

  async findViewById(
    tx: PrismaTx,
    tenantId: string,
    id: string,
  ): Promise<ManualRefundOperationViewRecord | null> {
    const row = await tx.manualRefundOperation.findFirst({
      where: { id, tenantId },
      include: { refundBatch: { include: { booking: { select: { id: true, code: true } } } } },
    });
    if (!row) return null;
    return {
      operation: toRecord(row),
      bookingId: row.refundBatch.booking.id,
      bookingCode: row.refundBatch.booking.code,
      requestedAmount: row.refundBatch.requestedAmount,
    };
  }

  async listViews(
    tx: PrismaTx,
    tenantId: string,
    query: ManualRefundListQuery,
    overdueBefore: Date | null,
  ): Promise<RepoPage<ManualRefundOperationViewRecord>> {
    const where: Prisma.ManualRefundOperationWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(overdueBefore ? { transferDueAt: { lt: overdueBefore } } : {}),
      ...(query.search
        ? { refundBatch: { booking: { code: { contains: query.search, mode: 'insensitive' } } } }
        : {}),
    };
    const { skip, take } = pageOffset(query);
    const [rows, total] = await Promise.all([
      tx.manualRefundOperation.findMany({
        where,
        include: { refundBatch: { include: { booking: { select: { id: true, code: true } } } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      tx.manualRefundOperation.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        operation: toRecord(row),
        bookingId: row.refundBatch.booking.id,
        bookingCode: row.refundBatch.booking.code,
        requestedAmount: row.refundBatch.requestedAmount,
      })),
      total,
    };
  }

  async listViewsForBooking(
    tx: PrismaTx,
    tenantId: string,
    bookingId: string,
  ): Promise<ManualRefundOperationViewRecord[]> {
    const rows = await tx.manualRefundOperation.findMany({
      where: { tenantId, refundBatch: { bookingId } },
      include: { refundBatch: { include: { booking: { select: { id: true, code: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      operation: toRecord(row),
      bookingId: row.refundBatch.booking.id,
      bookingCode: row.refundBatch.booking.code,
      requestedAmount: row.refundBatch.requestedAmount,
    }));
  }

  async casUpdate(
    tx: PrismaTx,
    tenantId: string,
    id: string,
    expectedStatus: ManualRefundOperationRecord['status'],
    expectedVersion: number,
    patch: ManualRefundOperationPatch,
  ): Promise<ManualRefundOperationRecord | null> {
    try {
      const data = {
        ...patch,
        ...('transferReference' in patch
          ? {
              transferReferenceNormalized: patch.transferReference
                ? normalizeManualRefundTransferReference(patch.transferReference)
                : null,
            }
          : {}),
        version: { increment: 1 as const },
      };
      const changed = await tx.manualRefundOperation.updateMany({
        where: { id, tenantId, status: expectedStatus, version: expectedVersion },
        data,
      });
      if (changed.count !== 1) return null;
      const row = await tx.manualRefundOperation.findUnique({ where: { id, tenantId } });
      return row ? toRecord(row) : null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ManualRefundTransferReferenceAlreadyUsed();
      }
      throw error;
    }
  }
}
