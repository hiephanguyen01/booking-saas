import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateCustomRateIntent,
  AffiliatePayoutInfoIntent,
  AffiliateState,
  AffiliateStatusIntent,
  NewAffiliate,
} from '../entities/affiliate.entity';
import type {
  AffiliateRecord,
  AffiliateWithUser,
} from './affiliate-reader.port';

export const AFFILIATE_REPOSITORY = Symbol('AFFILIATE_REPOSITORY');

export interface IAffiliateRepository {
  create(tx: PrismaTx, affiliate: NewAffiliate): Promise<AffiliateRecord>;
  loadById(tx: PrismaTx, id: string): Promise<AffiliateState | null>;
  loadByUser(
    tx: PrismaTx,
    userId: string,
  ): Promise<AffiliateState | null>;
  /** Unconditional column write; the aggregate intentionally permits any/same-state requests. */
  setStatus(
    tx: PrismaTx,
    id: string,
    intent: AffiliateStatusIntent,
  ): Promise<AffiliateRecord>;
  /** Replace only `custom_rate`; never save/clobber the aggregate's other columns. */
  setCustomRate(
    tx: PrismaTx,
    id: string,
    intent: AffiliateCustomRateIntent,
  ): Promise<AffiliateRecord>;
  /**
   * Replace only `payout_info` as one object. The joined return is produced by
   * the same UPDATE query, preserving the existing no-pre-read behavior.
   */
  replacePayoutInfo(
    tx: PrismaTx,
    id: string,
    intent: AffiliatePayoutInfoIntent,
  ): Promise<AffiliateWithUser>;
}
