import type { BookingMode } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RuleType } from '../pricing/quote-calculator';

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

export interface CreatePricingRuleData {
  listingId: string;
  bookingMode: BookingMode;
  ruleType: RuleType;
  params: Record<string, unknown>;
  price: string;
  salePrice?: string | null;
  priority: number;
}

export interface IPricingRuleRepository {
  create(tx: PrismaTx, tenantId: string, data: CreatePricingRuleData): Promise<PricingRuleRecord>;
  findById(tx: PrismaTx, id: string): Promise<PricingRuleRecord | null>;
  listByListing(tx: PrismaTx, listingId: string): Promise<PricingRuleRecord[]>;
  delete(tx: PrismaTx, id: string): Promise<void>;
}
