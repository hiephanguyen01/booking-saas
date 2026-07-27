import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { normalizeHostname } from '../../../../shared/http/hostname';
import type { IFavoriteTenantReader } from '../../domain/ports/favorite-tenant-reader.port';

@Injectable()
export class PrismaFavoriteTenantReader implements IFavoriteTenantReader {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantId(host: string): Promise<string | null> {
    const hostname = normalizeHostname(host);
    if (!hostname) return null;
    const domain = await this.prisma.admin.tenantDomain.findFirst({
      where: { hostname, verifiedAt: { not: null }, tenant: { status: 'active' } },
      select: { tenantId: true },
    });
    return domain?.tenantId ?? null;
  }
}
