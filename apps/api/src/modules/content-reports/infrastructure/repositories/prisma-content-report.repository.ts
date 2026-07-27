import { Injectable } from '@nestjs/common';
import type {
  ContentReportStatus,
  ContentReportTarget,
  TenantContentReportsQuery,
} from '@booking/contracts';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  ACTIVE_CONTENT_REPORT_STATUSES,
  type ContentReport,
  type ContentReportState,
  type NewContentReport,
  type ReportableTarget,
} from '../../domain/entities/content-report.entity';
import type { IContentReportRepository } from '../../domain/ports/content-report-repository.port';
import type {
  ContentReportPage,
  ContentReportRecord,
  IContentReportReader,
} from '../../domain/ports/content-report-reader.port';
import { pageOffset } from '../../../../shared/pagination/pagination';

const select = {
  id: true,
  targetType: true,
  targetId: true,
  targetTitle: true,
  targetSlug: true,
  partnerId: true,
  partnerName: true,
  reporterUserId: true,
  reporterName: true,
  reason: true,
  details: true,
  status: true,
  handledByUserId: true,
  resolutionNote: true,
  handledAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Prisma.ContentReportGetPayload<{ select: typeof select }>;

function toRecord(row: Row): ContentReportRecord {
  return {
    id: row.id,
    target: row.targetType,
    targetId: row.targetId,
    targetTitle: row.targetTitle,
    targetSlug: row.targetSlug,
    partnerId: row.partnerId,
    partnerName: row.partnerName,
    reporterUserId: row.reporterUserId,
    reporterName: row.reporterName,
    reason: row.reason,
    details: row.details,
    status: row.status,
    handledByUserId: row.handledByUserId,
    resolutionNote: row.resolutionNote,
    handledAt: row.handledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaContentReportRepository
  implements IContentReportRepository, IContentReportReader
{
  async findPublishedTarget(
    tx: PrismaTx,
    target: ContentReportTarget,
    targetId: string,
  ): Promise<ReportableTarget | null> {
    if (target === 'listing') {
      const row = await tx.listing.findFirst({
        where: { id: targetId, status: 'published', partner: { status: 'approved' } },
        select: {
          id: true,
          title: true,
          slug: true,
          partner: { select: { id: true, name: true } },
        },
      });
      return row
        ? {
            target,
            id: row.id,
            title: row.title,
            slug: row.slug,
            partnerId: row.partner.id,
            partnerName: row.partner.name,
          }
        : null;
    }
    const row = await tx.listingGroup.findFirst({
      where: { id: targetId, status: 'published', partner: { status: 'approved' } },
      select: { id: true, title: true, slug: true, partner: { select: { id: true, name: true } } },
    });
    return row
      ? {
          target,
          id: row.id,
          title: row.title,
          slug: row.slug,
          partnerId: row.partner.id,
          partnerName: row.partner.name,
        }
      : null;
  }

  async getReporterName(tx: PrismaTx, userId: string): Promise<string | null> {
    return (
      (await tx.user.findUnique({ where: { id: userId }, select: { fullName: true } }))?.fullName ??
      null
    );
  }

  async createOrFindActive(
    tx: PrismaTx,
    tenantId: string,
    report: NewContentReport,
  ): Promise<{ report: ContentReportRecord; duplicate: boolean }> {
    const activeWhere = {
      tenantId,
      reporterUserId: report.reporterUserId,
      targetType: report.target,
      targetId: report.targetId,
      status: { in: [...ACTIVE_CONTENT_REPORT_STATUSES] },
    };
    const active = await tx.contentReport.findFirst({ where: activeWhere, select });
    if (active) return { report: toRecord(active), duplicate: true };

    const result = await tx.contentReport.createMany({
      data: [
        {
          tenantId,
          reporterUserId: report.reporterUserId,
          reporterName: report.reporterName,
          partnerId: report.partnerId,
          partnerName: report.partnerName,
          targetType: report.target,
          targetId: report.targetId,
          targetTitle: report.targetTitle,
          targetSlug: report.targetSlug,
          reason: report.reason,
          details: report.details,
        },
      ],
      skipDuplicates: true,
    });
    const created = await tx.contentReport.findFirstOrThrow({ where: activeWhere, select });
    return { report: toRecord(created), duplicate: result.count === 0 };
  }

  async list(tx: PrismaTx, query: TenantContentReportsQuery): Promise<ContentReportPage> {
    const baseWhere: Prisma.ContentReportWhereInput = {
      ...(query.target ? { targetType: query.target } : {}),
      ...(query.q
        ? {
            OR: [
              { targetTitle: { contains: query.q, mode: 'insensitive' } },
              { partnerName: { contains: query.q, mode: 'insensitive' } },
              { reporterName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const where: Prisma.ContentReportWhereInput = {
      ...baseWhere,
      ...(query.status !== 'all' ? { status: query.status } : {}),
    };
    const statuses: ContentReportStatus[] = ['open', 'reviewing', 'resolved', 'dismissed'];
    const { skip, take } = pageOffset(query);
    const [rows, total, all, ...statusCounts] = await Promise.all([
      tx.contentReport.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      tx.contentReport.count({ where }),
      tx.contentReport.count({ where: baseWhere }),
      ...statuses.map((status) => tx.contentReport.count({ where: { ...baseWhere, status } })),
    ]);
    return {
      items: rows.map(toRecord),
      total,
      counts: {
        all,
        ...Object.fromEntries(statuses.map((status, index) => [status, statusCounts[index] ?? 0])),
      },
    };
  }

  async findById(tx: PrismaTx, id: string): Promise<ContentReportRecord | null> {
    const row = await tx.contentReport.findUnique({ where: { id }, select });
    return row ? toRecord(row) : null;
  }

  async loadForModeration(tx: PrismaTx, id: string): Promise<ContentReportState | null> {
    const row = await tx.contentReport.findUnique({
      where: { id },
      select: { id: true, status: true, targetType: true, targetId: true },
    });
    return row
      ? { id: row.id, status: row.status, target: row.targetType, targetId: row.targetId }
      : null;
  }

  async saveModeration(tx: PrismaTx, report: ContentReport): Promise<ContentReportRecord | null> {
    const pending = report.pendingModeration();
    // Defensive: the use-case always calls moderate() first; null here is a programming error.
    if (!pending) {
      throw new Error(
        'saveModeration called without a pending moderation — moderate() must run first',
      );
    }
    const changed = await tx.contentReport.updateMany({
      where: { id: report.id, status: report.status },
      data: {
        status: pending.status,
        resolutionNote: pending.resolutionNote,
        handledByUserId: pending.handledByUserId,
        handledAt: pending.handledAt,
      },
    });
    if (changed.count === 0) return null;
    const updated = await tx.contentReport.findUnique({ where: { id: report.id }, select });
    return updated ? toRecord(updated) : null;
  }
}
