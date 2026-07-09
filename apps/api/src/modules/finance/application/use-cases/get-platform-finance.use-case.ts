import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface PlatformFinance {
  totalFeePayable: bigint;
  perTenant: Array<{ tenantId: string; feePayable: bigint }>;
}

/**
 * Platform-admin finance (§13.3): platform fee collected per tenant. This is a
 * cross-tenant read, so it uses the BYPASSRLS admin pool explicitly.
 */
@Injectable()
export class GetPlatformFinanceUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<PlatformFinance> {
    const rows = await this.prisma.admin.$queryRaw<{ tenant_id: string; fee: bigint }[]>(Prisma.sql`
      SELECT la.tenant_id, COALESCE(SUM(le.credit - le.debit), 0)::bigint AS fee
      FROM ledger_accounts la
      JOIN ledger_entries le ON le.account_id = la.id
      WHERE la.owner_type = 'platform'
      GROUP BY la.tenant_id`);
    const perTenant = rows.map((r) => ({ tenantId: r.tenant_id, feePayable: r.fee }));
    return { totalFeePayable: perTenant.reduce((acc, r) => acc + r.feePayable, 0n), perTenant };
  }
}
