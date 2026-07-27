import type { BookingMode } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RuleType } from '../../../../shared/domain/pricing/quote-calculator';
import type { NewPricingRule } from '../entities/pricing-rule.entity';

export const PRICING_RULE_REPOSITORY = Symbol('PRICING_RULE_REPOSITORY');

export interface PricingRuleRecord {
  id: string;
  tenantId: string;
  listingId: string;
  bookingMode: BookingMode;
  ruleType: RuleType;
  params: Record<string, unknown>;
  /** VND đồng digit string (stored as BigInt). */
  price: string;
  /** Optional partner-funded sale price; lower than `price`. */
  salePrice: string | null;
  priority: number;
  createdAt: Date;
}

export interface IPricingRuleRepository {
  create(tx: PrismaTx, tenantId: string, data: NewPricingRule): Promise<PricingRuleRecord>;
  findById(tx: PrismaTx, id: string): Promise<PricingRuleRecord | null>;
  listByListing(tx: PrismaTx, listingId: string): Promise<PricingRuleRecord[]>;
  delete(tx: PrismaTx, id: string): Promise<void>;
}
