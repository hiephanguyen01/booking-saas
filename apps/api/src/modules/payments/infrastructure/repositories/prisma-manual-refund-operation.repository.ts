import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
} from '../../domain/ports/manual-refund-operation-repository.port';

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
