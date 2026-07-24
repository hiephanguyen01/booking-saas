import type { Vnd } from '../../../../shared/money/money';
import {
  computeRefund,
  hoursUntil,
  refundPercent,
  type CancellationTier,
} from '../cancellation-policy';
import { DepositBelowTenantCommission } from '../errors/booking-domain-errors';

export class BookingMoney {
  private constructor() {}

  static discounted(
    subtotal: Vnd,
    promo: { discountAmount: Vnd; finalAmount: Vnd } | null,
  ): {
    discountAmount: Vnd;
    finalAmount: Vnd;
  } {
    return promo
      ? { discountAmount: promo.discountAmount, finalAmount: promo.finalAmount }
      : { discountAmount: 0n, finalAmount: subtotal };
  }

  static assertDepositCoversTenantCommission(input: {
    isHouse: boolean;
    depositAmount: Vnd;
    tenantCommissionGross: Vnd;
    commissionRuleId: string | null;
  }): void {
    if (!input.isHouse && input.depositAmount < input.tenantCommissionGross) {
      throw new DepositBelowTenantCommission(
        input.depositAmount,
        input.tenantCommissionGross,
        input.commissionRuleId,
      );
    }
  }

  static cancellationSettlement(input: {
    actor: string;
    paidAmount: Vnd;
    securityDeposit: Vnd;
    startUtc: Date;
    now: Date;
    policySnapshot: unknown;
  }): { refundAmount: Vnd; refundPercent: number } {
    const percent =
      input.actor === 'customer'
        ? refundPercent(
            (input.policySnapshot ?? []) as CancellationTier[],
            hoursUntil(input.startUtc, input.now),
          )
        : 100;
    return {
      refundAmount: computeRefund(input.paidAmount, percent) + input.securityDeposit,
      refundPercent: percent,
    };
  }

  /** Preserve the legacy JSONB tolerance: only positive safe numbers and digit strings count. */
  static sumAdditionalCharges(raw: unknown): Vnd {
    if (!Array.isArray(raw)) return 0n;
    return raw.reduce<Vnd>((total, item) => {
      const amount = (item as { amount?: unknown })?.amount;
      if (typeof amount === 'string' && /^\d+$/.test(amount)) return total + BigInt(amount);
      if (typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0) {
        return total + BigInt(amount);
      }
      return total;
    }, 0n);
  }

  static outstandingOnsite(finalAmount: Vnd, additionalCharges: unknown, paidAmount: Vnd): Vnd {
    const effectiveFinal = finalAmount + this.sumAdditionalCharges(additionalCharges);
    return effectiveFinal > paidAmount ? effectiveFinal - paidAmount : 0n;
  }
}
