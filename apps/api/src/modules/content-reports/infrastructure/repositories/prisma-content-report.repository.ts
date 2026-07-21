import { Injectable } from '@nestjs/common';
import type {
  ContentReportStatus,
  ContentReportTarget,
  CreateContentReportInput,
  TenantContentReportsQuery,
} from '@booking/contracts';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  ContentReportPage,
  ContentReportRecord,
  IContentReportRepository,
  ReportTargetRecord,
} from '../../domain/ports/content-report-repository.port';

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
  return { ...row, target: row.targetType };
}

@Injectable()
export class PrismaContentReportRepository implements IContentReportRepository {
  async findPublishedTarget(
    tx: PrismaTx,
    target: ContentReportTarget,
    targetId: string,
  ): Promise<ReportTargetRecord | null> {
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
    reporterUserId: string,
    reporterName: string,
    target: ReportTargetRecord,
    input: CreateContentReportInput,
  ): Promise<{ report: ContentReportRecord; duplicate: boolean }> {
    const activeWhere = {
      tenantId,
      reporterUserId,
      targetType: target.target,
      targetId: target.id,
      status: { in: ['open', 'reviewing'] as ContentReportStatus[] },
    };
    const active = await tx.contentReport.findFirst({ where: activeWhere, select });
    if (active) return { report: toRecord(active), duplicate: true };

    const result = await tx.contentReport.createMany({
      data: [
        {
          tenantId,
          reporterUserId,
          reporterName,
          partnerId: target.partnerId,
          partnerName: target.partnerName,
          targetType: target.target,
          targetId: target.id,
          targetTitle: target.title,
          targetSlug: target.slug,
          reason: input.reason,
          details: input.details || null,
        },
      ],
      skipDuplicates: true,
    });
    const report = await tx.contentReport.findFirstOrThrow({ where: activeWhere, select });
    return { report: toRecord(report), duplicate: result.count === 0 };
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
    const [rows, total, all, ...statusCounts] = await Promise.all([
      tx.contentReport.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
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

  async updateStatus(
    tx: PrismaTx,
    id: string,
    status: ContentReportStatus,
    resolutionNote: string | null,
    handledByUserId: string,
  ): Promise<ContentReportRecord> {
    const terminal = status === 'resolved' || status === 'dismissed';
    return toRecord(
      await tx.contentReport.update({
        where: { id },
        data: {
          status,
          resolutionNote,
          handledByUserId,
          handledAt: terminal ? new Date() : null,
        },
        select,
      }),
    );
  }
}
