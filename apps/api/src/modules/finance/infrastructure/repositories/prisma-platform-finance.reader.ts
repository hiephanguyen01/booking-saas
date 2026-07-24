import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  IPlatformFinanceReader,
  PlatformFeeRow,
} from '../../domain/ports/platform-finance-reader.port';

@Injectable()
export class PrismaPlatformFinanceReader implements IPlatformFinanceReader {
  constructor(private readonly prisma: PrismaService) {}

  async listPlatformFees(): Promise<PlatformFeeRow[]> {
    const rows = await this.prisma.admin.$queryRaw<{ tenant_id: string; fee: bigint }[]>(Prisma.sql`
      SELECT la.tenant_id, COALESCE(SUM(le.credit - le.debit), 0)::bigint AS fee
      FROM ledger_accounts la
      JOIN ledger_entries le ON le.account_id = la.id
      WHERE la.owner_type = 'platform'
      GROUP BY la.tenant_id`);
    return rows.map((row) => ({ tenantId: row.tenant_id, feePayable: row.fee }));
  }
}
