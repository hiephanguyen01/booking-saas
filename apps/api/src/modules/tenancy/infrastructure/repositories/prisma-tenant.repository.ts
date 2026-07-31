import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type {
  CreateTenantData,
  ITenantRepository,
  ListTenantsParams,
  TenantRecord,
  UpdateTenantData,
} from '../../domain/ports/tenant-repository.port';
import { pageOffset } from '../../../../shared/pagination/pagination';

type PrismaTenant = Prisma.TenantGetPayload<Record<string, never>>;

function toRecord(t: PrismaTenant): TenantRecord {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    vertical: t.vertical,
    defaultTimezone: t.defaultTimezone,
    defaultLocale: t.defaultLocale,
    themeConfig: (t.themeConfig ?? {}) as Record<string, unknown>,
    settings: (t.settings ?? {}) as Record<string, unknown>,
    defaultCancellationPolicyId: t.defaultCancellationPolicyId,
    legalReadyAt: t.legalReadyAt,
    legalDocumentsReady: t.legalDocumentsReady,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Tenant management runs on the BYPASSRLS admin pool (§6.3) — no tenant context. */
@Injectable()
export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTenantData, tx?: PrismaTx): Promise<TenantRecord> {
    const client = tx ?? this.prisma.admin;
    return toRecord(await client.tenant.create({ data }));
  }

  /** One admin-pool transaction so multi-table platform-admin writes are atomic. */
  runInTransaction<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.prisma.admin.$transaction((tx) => fn(tx));
  }

  async findById(id: string): Promise<TenantRecord | null> {
    const t = await this.prisma.admin.tenant.findUnique({ where: { id } });
    return t ? toRecord(t) : null;
  }

  async findBySlug(slug: string): Promise<TenantRecord | null> {
    const t = await this.prisma.admin.tenant.findUnique({ where: { slug } });
    return t ? toRecord(t) : null;
  }

  async list(params: ListTenantsParams): Promise<RepoPage<TenantRecord>> {
    const where: Prisma.TenantWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.vertical ? { vertical: params.vertical } : {}),
      // `total` must be filtered identically to `items` or the pager lies.
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { skip, take } = pageOffset(params);
    const [items, total] = await Promise.all([
      this.prisma.admin.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.admin.tenant.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async update(id: string, data: UpdateTenantData): Promise<TenantRecord> {
    return toRecord(
      await this.prisma.admin.tenant.update({
        where: { id },
        data: {
          name: data.name,
          vertical: data.vertical,
          defaultTimezone: data.defaultTimezone,
          defaultLocale: data.defaultLocale,
          status: data.status,
          themeConfig: data.themeConfig as Prisma.InputJsonValue | undefined,
          settings: data.settings as Prisma.InputJsonValue | undefined,
          defaultCancellationPolicyId: data.defaultCancellationPolicyId,
        },
      }),
    );
  }

  /**
   * Stamps or clears the legal-readiness marker. Only called by the
   * legal-readiness outbox handler — never by the platform-admin tenant form.
   */
  async setLegalReadiness(tenantId: string, at: Date | null, publishedCount: number): Promise<void> {
    await this.prisma.admin.tenant.update({
      where: { id: tenantId },
      data: { legalReadyAt: at, legalDocumentsReady: publishedCount },
    });
  }

  /** True when `policyId` is a tenant-level (partner_id null) policy of this tenant. */
  async isTenantLevelPolicy(tenantId: string, policyId: string): Promise<boolean> {
    const policy = await this.prisma.admin.cancellationPolicy.findFirst({
      where: { id: policyId, tenantId, partnerId: null },
      select: { id: true },
    });
    return policy !== null;
  }

  countPartners(tenantId: string): Promise<number> {
    return this.prisma.admin.partner.count({ where: { tenantId } });
  }

  countListings(tenantId: string): Promise<number> {
    return this.prisma.admin.listing.count({ where: { tenantId } });
  }

  countBookingsBetween(tenantId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.admin.booking.count({
      where: { tenantId, createdAt: { gte: from, lt: to } },
    });
  }
}
