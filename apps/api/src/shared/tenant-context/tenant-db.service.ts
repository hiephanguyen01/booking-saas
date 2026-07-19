import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

export type PrismaTx = Prisma.TransactionClient;

/**
 * RLS entry point (TONG-QUAN.md §6.4). Every tenant-scoped use case runs inside
 * ONE interactive transaction with the GUC set on that same tx — setting it on
 * a different connection would silently disable RLS. Repositories must only
 * ever receive the `tx`; using the raw prisma client in business code is
 * forbidden.
 */
@Injectable()
export class TenantDbService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  async forTenant<T>(tenantId: string, fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.prisma.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  /** Convenience wrapper reading the tenant from the request context. */
  async forCurrentTenant<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.forTenant(this.context.tenantIdOrThrow(), fn);
  }

  /** Read the transaction's PostgreSQL clock; business deadlines must not use the app host clock. */
  async databaseNow(tx: PrismaTx): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
    const now = rows[0]?.now;
    if (!now) throw new Error('Database clock query returned no row');
    return now;
  }
}
