import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TenantHostKind } from '../../domain/ports/tenant-cache.port';
import type {
  CreateDomainData,
  DomainRecord,
  ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';

type PrismaDomain = Prisma.TenantDomainGetPayload<Record<string, never>>;

function toRecord(d: PrismaDomain): DomainRecord {
  return {
    id: d.id,
    tenantId: d.tenantId,
    hostname: d.hostname,
    isPrimary: d.isPrimary,
    kind: d.kind,
    verificationToken: d.verificationToken,
    verifiedAt: d.verifiedAt,
  };
}

@Injectable()
export class PrismaTenantDomainRepository implements ITenantDomainRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateDomainData, tx?: PrismaTx): Promise<DomainRecord> {
    const client = tx ?? this.prisma.admin;
    return toRecord(await client.tenantDomain.create({ data }));
  }

  async findByHostname(hostname: string): Promise<DomainRecord | null> {
    const d = await this.prisma.admin.tenantDomain.findUnique({ where: { hostname } });
    return d ? toRecord(d) : null;
  }

  async findById(id: string, tx?: PrismaTx): Promise<DomainRecord | null> {
    const client = tx ?? this.prisma.admin;
    const d = await client.tenantDomain.findUnique({ where: { id } });
    return d ? toRecord(d) : null;
  }

  async listByTenant(tenantId: string): Promise<DomainRecord[]> {
    const rows = await this.prisma.admin.tenantDomain.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async listByTenantAndKind(tenantId: string, kind: TenantHostKind): Promise<DomainRecord[]> {
    const rows = await this.prisma.admin.tenantDomain.findMany({
      where: { tenantId, kind },
      orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findPrimaryHostname(tenantId: string, kind: TenantHostKind): Promise<string | null> {
    const row = await this.prisma.admin.tenantDomain.findFirst({
      where: { tenantId, kind, isPrimary: true, verifiedAt: { not: null } },
      select: { hostname: true },
    });
    return row?.hostname ?? null;
  }

  async markVerified(id: string): Promise<DomainRecord> {
    return toRecord(
      await this.prisma.admin.tenantDomain.update({
        where: { id },
        data: { verifiedAt: new Date(), verificationToken: null },
      }),
    );
  }

  async setPrimary(tenantId: string, id: string, tx: PrismaTx): Promise<DomainRecord> {
    // Load first: the primary being cleared must be the one of the SAME kind.
    // Clearing by tenant alone would demote the other surface's primary, and the
    // partial unique index is on (tenant_id, kind) so nothing would catch it.
    const target = await tx.tenantDomain.findUniqueOrThrow({ where: { id } });
    await tx.tenantDomain.updateMany({
      where: { tenantId, kind: target.kind, isPrimary: true },
      data: { isPrimary: false },
    });
    return toRecord(
      await tx.tenantDomain.update({ where: { id }, data: { isPrimary: true } }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.prisma.admin.tenantDomain.delete({ where: { id } });
  }
}
