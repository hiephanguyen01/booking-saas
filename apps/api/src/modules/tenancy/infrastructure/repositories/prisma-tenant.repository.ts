import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateTenantData,
  ITenantRepository,
  TenantRecord,
  UpdateTenantData,
} from '../../domain/ports/tenant-repository.port';

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
    createdAt: t.createdAt,
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

  async list(params: {
    page: number;
    pageSize: number;
  }): Promise<{ items: TenantRecord[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.admin.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.admin.tenant.count(),
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
        },
      }),
    );
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
