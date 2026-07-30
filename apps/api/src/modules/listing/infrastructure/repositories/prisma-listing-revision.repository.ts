import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RevisionStatus, RevisionTarget } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IListingRevisionRepository,
  ListingRevisionRecord,
  NewListingRevision,
  RevisionDecision,
} from '../../domain/ports/listing-revision-repository.port';

type Row = Prisma.ListingRevisionGetPayload<object>;

function toRecord(r: Row): ListingRevisionRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    targetType: r.targetType as RevisionTarget,
    targetId: r.targetId,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: r.status as RevisionStatus,
    submittedByUserId: r.submittedByUserId,
    submittedAt: r.submittedAt,
    reviewedByUserId: r.reviewedByUserId,
    reviewedAt: r.reviewedAt,
    reviewNote: r.reviewNote,
    appliedAt: r.appliedAt,
  };
}

@Injectable()
export class PrismaListingRevisionRepository implements IListingRevisionRepository {
  async findPending(
    tx: PrismaTx,
    targetType: RevisionTarget,
    targetId: string,
  ): Promise<ListingRevisionRecord | null> {
    const row = await tx.listingRevision.findFirst({
      where: { targetType, targetId, status: 'pending' },
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Pending wins; otherwise the newest rejection, and only while it is still the
   * latest word on the target — a later approval or discard means the partner has
   * nothing left open.
   */
  async findOpen(
    tx: PrismaTx,
    targetType: RevisionTarget,
    targetId: string,
  ): Promise<ListingRevisionRecord | null> {
    const latest = await tx.listingRevision.findFirst({
      where: { targetType, targetId },
      orderBy: { submittedAt: 'desc' },
    });
    if (!latest) return null;
    const record = toRecord(latest);
    return record.status === 'pending' || record.status === 'rejected' ? record : null;
  }

  async findPendingForTargets(
    tx: PrismaTx,
    targetType: RevisionTarget,
    targetIds: readonly string[],
  ): Promise<ListingRevisionRecord[]> {
    if (targetIds.length === 0) return [];
    const rows = await tx.listingRevision.findMany({
      where: { targetType, targetId: { in: [...targetIds] }, status: 'pending' },
      orderBy: { submittedAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async listPending(tx: PrismaTx): Promise<ListingRevisionRecord[]> {
    const rows = await tx.listingRevision.findMany({
      where: { status: 'pending' },
      orderBy: { submittedAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async findById(tx: PrismaTx, id: string): Promise<ListingRevisionRecord | null> {
    const row = await tx.listingRevision.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  /**
   * Overwrite in place when the target already has a waiting edit, so the partner
   * keeps exactly one queue entry no matter how many times they save. The write
   * also re-stamps `submittedAt`, which is what the reviewer's queue orders by.
   */
  async upsertPending(
    tx: PrismaTx,
    tenantId: string,
    data: NewListingRevision,
  ): Promise<ListingRevisionRecord> {
    const existing = await tx.listingRevision.findFirst({
      where: { targetType: data.targetType, targetId: data.targetId, status: 'pending' },
      select: { id: true },
    });
    const payload = data.payload as Prisma.InputJsonValue;
    if (existing) {
      return toRecord(
        await tx.listingRevision.update({
          where: { id: existing.id },
          data: {
            payload,
            submittedByUserId: data.submittedByUserId,
            submittedAt: new Date(),
            reviewNote: null,
          },
        }),
      );
    }
    return toRecord(
      await tx.listingRevision.create({
        data: {
          tenantId,
          targetType: data.targetType,
          targetId: data.targetId,
          payload,
          submittedByUserId: data.submittedByUserId,
        },
      }),
    );
  }

  async decide(
    tx: PrismaTx,
    id: string,
    expectedStatus: RevisionStatus,
    decision: RevisionDecision,
  ): Promise<ListingRevisionRecord | null> {
    const result = await tx.listingRevision.updateMany({
      where: { id, status: expectedStatus },
      data: {
        status: decision.status,
        reviewedByUserId: decision.reviewedByUserId,
        reviewedAt: new Date(),
        reviewNote: decision.reviewNote,
        appliedAt: decision.appliedAt,
      },
    });
    if (result.count === 0) return null;
    const row = await tx.listingRevision.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }
}
