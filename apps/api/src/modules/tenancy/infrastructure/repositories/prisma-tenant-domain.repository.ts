import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
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

  async findById(id: string): Promise<DomainRecord | null> {
    const d = await this.prisma.admin.tenantDomain.findUnique({ where: { id } });
    return d ? toRecord(d) : null;
  }

  async listByTenant(tenantId: string): Promise<DomainRecord[]> {
    const rows = await this.prisma.admin.tenantDomain.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { hostname: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async markVerified(id: string): Promise<DomainRecord> {
    return toRecord(
      await this.prisma.admin.tenantDomain.update({
        where: { id },
        data: { verifiedAt: new Date(), verificationToken: null },
      }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.prisma.admin.tenantDomain.delete({ where: { id } });
  }
}
