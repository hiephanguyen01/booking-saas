import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { IReviewTenantReader } from '../../domain/ports/review-tenant-reader.port';

@Injectable()
export class PrismaReviewTenantReader implements IReviewTenantReader {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantId(host: string): Promise<string | null> {
    const hostname = host.split(':')[0]?.trim().toLowerCase();
    if (!hostname) return null;
    const domain = await this.prisma.admin.tenantDomain.findFirst({
      where: { hostname, verifiedAt: { not: null }, tenant: { status: 'active' } },
      select: { tenantId: true },
    });
    return domain?.tenantId ?? null;
  }
}
