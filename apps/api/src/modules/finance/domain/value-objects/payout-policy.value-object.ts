import type { PayoutCycleDto } from '@booking/contracts';
import { addDays } from '../../../../shared/time/time';

export class PayoutPolicy {
  private constructor(
    readonly holdingDays: number,
    readonly minAmount: bigint,
    readonly cycle: PayoutCycleDto,
  ) {}

  static fromStored(stored: unknown): PayoutPolicy {
    const payout = (
      stored as {
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
    return new PayoutPolicy(holdingDays, minAmount, cycle);
  }

  period(input: { cycle?: PayoutCycleDto; periodFrom?: string; periodTo?: string; cutoff: Date }): {
    periodFrom: Date;
    periodTo: Date;
  } {
    const cycle = input.cycle ?? this.cycle;
    const periodTo = input.periodTo ? new Date(input.periodTo) : input.cutoff;
    const periodFrom = input.periodFrom
      ? new Date(input.periodFrom)
      : addDays(periodTo, cycle === 'weekly' ? -7 : -30);
    return { periodFrom, periodTo };
  }
}
