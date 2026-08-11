import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  ITaxDocumentCleanupRepository,
  TaxDocumentCleanupCandidate,
} from '../../domain/ports/tax-document-cleanup-repository.port';

@Injectable()
export class PrismaTaxDocumentCleanupRepository implements ITaxDocumentCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCandidates(limit: number, now: Date): Promise<TaxDocumentCleanupCandidate[]> {
    return this.prisma.admin.taxDocumentUpload.findMany({
      where: {
        deletedAt: null,
        OR: [{ status: 'pending', expiresAt: { lte: now } }, { status: 'expired' }],
      },
      select: { id: true, tenantId: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
  }

  async claim(tx: PrismaTx, tenantId: string, id: string, now: Date): Promise<string | null> {
    await tx.taxDocumentUpload.updateMany({
      where: { id, tenantId, status: 'pending', expiresAt: { lte: now }, deletedAt: null },
      data: { status: 'expired' },
    });
    const row = await tx.taxDocumentUpload.findFirst({
      where: { id, tenantId, status: 'expired', deletedAt: null },
      select: { objectKey: true },
    });
    return row?.objectKey ?? null;
  }

  async markDeleted(tx: PrismaTx, tenantId: string, id: string, deletedAt: Date): Promise<void> {
    await tx.taxDocumentUpload.updateMany({
      where: { id, tenantId, status: 'expired', deletedAt: null },
      data: { deletedAt },
    });
  }
}
