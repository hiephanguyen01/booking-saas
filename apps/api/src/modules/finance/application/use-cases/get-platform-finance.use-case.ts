import { Inject, Injectable } from '@nestjs/common';
import {
  PLATFORM_FINANCE_READER,
  type IPlatformFinanceReader,
} from '../../domain/ports/platform-finance-reader.port';

export interface PlatformFinance {
  totalFeePayable: bigint;
  perTenant: Array<{ tenantId: string; feePayable: bigint }>;
}

/**
 * Platform-admin finance (§13.3): platform fee collected per tenant. This is a
 * cross-tenant read, so the reader adapter owns the BYPASSRLS admin-pool query.
 */
@Injectable()
export class GetPlatformFinanceUseCase {
  constructor(
    @Inject(PLATFORM_FINANCE_READER)
    private readonly platformFinance: IPlatformFinanceReader,
  ) {}

  async execute(): Promise<PlatformFinance> {
    const perTenant = await this.platformFinance.listPlatformFees();
    return { totalFeePayable: perTenant.reduce((acc, r) => acc + r.feePayable, 0n), perTenant };
  }
}
