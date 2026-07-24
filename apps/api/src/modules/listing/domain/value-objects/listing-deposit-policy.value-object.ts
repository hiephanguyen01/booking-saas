import { DepositBelowTenantCommission } from '../errors/listing-errors';

export interface DepositCommissionRule {
  id: string;
  rateType: 'percent' | 'fixed';
  rate: bigint;
}

export class ListingDepositPolicy {
  private constructor(private readonly rule: DepositCommissionRule | null) {}

  static fromRule(rule: DepositCommissionRule | null): ListingDepositPolicy {
    return new ListingDepositPolicy(rule);
  }

  requirement(): {
    minimumDepositPercent: number | null;
    commissionRuleId: string | null;
  } {
    if (this.rule?.rateType !== 'percent') {
      return { minimumDepositPercent: null, commissionRuleId: null };
    }
    return {
      minimumDepositPercent: Number(this.rule.rate),
      commissionRuleId: this.rule.id,
    };
  }

  assertCovered(input: { isHouse: boolean; depositPercent: number }): void {
    if (
      input.isHouse ||
      this.rule?.rateType !== 'percent' ||
      BigInt(input.depositPercent) >= this.rule.rate
    ) {
      return;
    }
    throw new DepositBelowTenantCommission(
      input.depositPercent,
      this.rule.rate,
      this.rule.id,
    );
  }
}
