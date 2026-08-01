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
  /** Campaign window for `salePrice`, half-open `[start, end)` at booking time. */
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  campaignLabel: string | null;
  priority: number;
  createdAt: Date;
}

/** Inclusive `YYYY-MM-DD` calendar window used to narrow date-scoped rules. */
export interface PricingRuleDateWindow {
  from: string;
  to: string;
}

export interface IPricingRuleRepository {
  create(tx: PrismaTx, tenantId: string, data: NewPricingRule): Promise<PricingRuleRecord>;
  findById(tx: PrismaTx, id: string): Promise<PricingRuleRecord | null>;
  /**
   * Every rule of a listing, or — with `window` — only those that can affect a
   * date inside it. Recurring rules (`day_of_week`, `time_range`) match any
   * date and are therefore always returned, so a windowed read stays a correct
   * pricing picture for that window rather than a partial one.
   */
  listByListing(
    tx: PrismaTx,
    listingId: string,
    window?: PricingRuleDateWindow,
  ): Promise<PricingRuleRecord[]>;
  /**
   * Every rule of several listings at once, for surfaces that render a whole
   * group of listings (a listing group's rooms, a favorites page). One `IN`
   * query rather than a `listByListing` per row.
   */
  listByListings(tx: PrismaTx, listingIds: readonly string[]): Promise<PricingRuleRecord[]>;
  delete(tx: PrismaTx, id: string): Promise<void>;
}
