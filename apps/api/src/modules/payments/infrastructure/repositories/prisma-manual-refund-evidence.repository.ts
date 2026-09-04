import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IManualRefundEvidenceRepository,
  ManualRefundEvidenceUploadRecord,
} from '../../domain/ports/manual-refund-evidence-repository.port';

type Row = Prisma.ManualRefundEvidenceUploadGetPayload<Record<string, never>>;

function toRecord(row: Row): ManualRefundEvidenceUploadRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    operationId: row.operationId,
    objectKey: row.objectKey,
    checksum: row.checksum,
    sizeBytes: row.sizeBytes,
    contentType: row.contentType,
    status: row.status as ManualRefundEvidenceUploadRecord['status'],
    expiresAt: row.expiresAt,
    claimedAt: row.claimedAt,
    quarantinedAt: row.quarantinedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaManualRefundEvidenceRepository implements IManualRefundEvidenceRepository {
  async createUpload(
    tx: PrismaTx,
    tenantId: string,
    input: {
      operationId: string;
      objectKey: string;
      checksum: string;
      sizeBytes: number;
      contentType: string;
      expiresAt: Date;
    },
  ): Promise<ManualRefundEvidenceUploadRecord> {
    return toRecord(await tx.manualRefundEvidenceUpload.create({ data: { tenantId, ...input } }));
  }

  async findUpload(
    tx: PrismaTx,
    tenantId: string,
    operationId: string,
    objectKey: string,
  ): Promise<ManualRefundEvidenceUploadRecord | null> {
    const row = await tx.manualRefundEvidenceUpload.findFirst({
      where: { tenantId, operationId, objectKey },
    });
    return row ? toRecord(row) : null;
  }

  async claimUpload(tx: PrismaTx, tenantId: string, id: string, claimedAt: Date): Promise<boolean> {
    const result = await tx.manualRefundEvidenceUpload.updateMany({
      where: { id, tenantId, status: 'pending', expiresAt: { gt: claimedAt } },
      data: { status: 'claimed', claimedAt },
    });
    return result.count === 1;
  }

  async quarantineUpload(
    tx: PrismaTx,
    tenantId: string,
    id: string,
    quarantinedAt: Date,
  ): Promise<boolean> {
    const result = await tx.manualRefundEvidenceUpload.updateMany({
      where: { id, tenantId, status: 'pending' },
      data: { status: 'quarantined', quarantinedAt },
    });
    return result.count === 1;
  }

  async invalidateUploads(
    tx: PrismaTx,
    tenantId: string,
    operationId: string,
    invalidatedAt: Date,
  ): Promise<string[]> {
    const rows = await tx.manualRefundEvidenceUpload.findMany({
      where: { tenantId, operationId, status: { in: ['pending', 'claimed'] } },
      select: { id: true, objectKey: true },
    });
    if (rows.length) {
      await tx.manualRefundEvidenceUpload.updateMany({
        where: { tenantId, operationId, status: { in: ['pending', 'claimed'] } },
        data: { status: 'quarantined', quarantinedAt: invalidatedAt, claimedAt: null },
      });
    }
    return rows.map((row) => row.objectKey);
  }
}
