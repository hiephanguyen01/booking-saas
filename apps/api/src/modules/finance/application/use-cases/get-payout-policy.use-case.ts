import { Injectable } from '@nestjs/common';
import type { PayoutCycleDto } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export interface PayoutPolicy {
  holdingDays: number;
  minAmount: bigint;
  cycle: PayoutCycleDto;
}

/** Read and normalize the tenant's payout/dispute policy from `tenants.settings`. */
@Injectable()
export class GetPayoutPolicyUseCase {
  async execute(tx: PrismaTx, tenantId: string): Promise<PayoutPolicy> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const payout = (
      tenant?.settings as {
        payout?: { holdingDays?: number; minAmount?: string | number; cycle?: string };
      } | null
    )?.payout;
    const holdingDays =
      typeof payout?.holdingDays === 'number' &&
      Number.isInteger(payout.holdingDays) &&
      payout.holdingDays >= 0 &&
      payout.holdingDays <= 90
        ? payout.holdingDays
        : 3;
    const minAmount =
      payout?.minAmount !== undefined && /^\d+$/.test(String(payout.minAmount))
        ? BigInt(payout.minAmount)
        : 0n;
    const cycle: PayoutCycleDto = payout?.cycle === 'weekly' ? 'weekly' : 'monthly';
    return { holdingDays, minAmount, cycle };
  }
}
