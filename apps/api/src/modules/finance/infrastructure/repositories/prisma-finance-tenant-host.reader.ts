import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { normalizeHostname } from '../../../../shared/http/hostname';
import type { IFinanceTenantHostReader } from '../../domain/ports/finance-tenant-host-reader.port';

@Injectable()
export class PrismaFinanceTenantHostReader implements IFinanceTenantHostReader {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantId(host: string): Promise<string | null> {
    const domain = await this.prisma.admin.tenantDomain.findUnique({
      where: { hostname: normalizeHostname(host) },
      select: { tenantId: true },
    });
    return domain?.tenantId ?? null;
  }
}
