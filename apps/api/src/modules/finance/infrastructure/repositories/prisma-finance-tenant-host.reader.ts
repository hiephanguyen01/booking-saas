import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { IFinanceTenantHostReader } from '../../domain/ports/finance-tenant-host-reader.port';

function normalizeHost(host: string): string {
  const first = host.split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('[')) return first.slice(1, first.indexOf(']'));
  return first.split(':')[0] ?? first;
}

@Injectable()
export class PrismaFinanceTenantHostReader implements IFinanceTenantHostReader {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantId(host: string): Promise<string | null> {
    const domain = await this.prisma.admin.tenantDomain.findUnique({
      where: { hostname: normalizeHost(host) },
      select: { tenantId: true },
    });
    return domain?.tenantId ?? null;
  }
}
