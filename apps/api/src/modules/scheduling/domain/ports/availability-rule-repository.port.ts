import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const AVAILABILITY_RULE_REPOSITORY = Symbol('AVAILABILITY_RULE_REPOSITORY');

export interface AvailabilityRuleRecord {
  id: string;
  listingId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export interface AvailabilityRuleInputData {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export interface IAvailabilityRuleRepository {
  listByListing(tx: PrismaTx, listingId: string): Promise<AvailabilityRuleRecord[]>;
  /** Replace the listing's whole weekly rule set atomically. */
  replaceForListing(
    tx: PrismaTx,
    tenantId: string,
    listingId: string,
    rules: readonly AvailabilityRuleInputData[],
  ): Promise<AvailabilityRuleRecord[]>;
}
