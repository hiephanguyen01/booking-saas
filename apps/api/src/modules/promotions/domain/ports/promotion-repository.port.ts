import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { PromotionSpec } from '../promotion-discount';
import type { NewPromotion, PromotionPatch } from '../entities/promotion.entity';

export const PROMOTION_REPOSITORY = Symbol('PROMOTION_REPOSITORY');

/** A full `promotions` row (superset of {@link PromotionSpec}) for admin responses. */
export interface PromotionRecord extends PromotionSpec {
  tenantId: string;
  name: string;
  createdByPartnerId: string | null;
  fundingPartnerId: string | null;
  createdAt: Date;
  storefrontVisible: boolean;
}

/** Filters for the paginated promotion lists (tenant + partner). */
export interface PromotionListFilter {
  page: number;
  pageSize: number;
  /** Case-insensitive search over name / code. */
  q?: string;
  status?: 'draft' | 'active' | 'paused' | 'ended';
  /** Created-at range (inclusive ISO instants). */
  from?: string;
  to?: string;
}

export interface IPromotionRepository {
  create(tx: PrismaTx, tenantId: string, data: NewPromotion): Promise<PromotionRecord>;
  update(tx: PrismaTx, id: string, patch: PromotionPatch): Promise<PromotionRecord>;
  findById(tx: PrismaTx, id: string): Promise<PromotionRecord | null>;
  findByCode(tx: PrismaTx, code: string): Promise<PromotionRecord | null>;
  list(tx: PrismaTx, params: PromotionListFilter): Promise<RepoPage<PromotionRecord>>;
  /** Promotions created by a given partner (their own codes, §12.2 Phase 2). */
  listByPartner(
    tx: PrismaTx,
    partnerId: string,
    params: PromotionListFilter,
  ): Promise<RepoPage<PromotionRecord>>;
  /** Active, code-less auto-applied campaigns for the tenant (§12.1 Phase 2). */
  listActiveAutoCampaigns(tx: PrismaTx): Promise<PromotionRecord[]>;
  /** Active customer-entered codes explicitly made discoverable on the storefront. */
  listStorefrontVisibleCodes(tx: PrismaTx): Promise<PromotionRecord[]>;
  /** Tenant-created partner-funded promos awaiting this partner's opt-in (§12.2). */
  listPendingOptIn(tx: PrismaTx, partnerId: string): Promise<PromotionRecord[]>;
  /** Transition a promotion to `ended` (usage history is preserved, §12.2). */
  end(tx: PrismaTx, id: string): Promise<PromotionRecord>;
  /** Record the funding partner's opt-in (sets `partner_opt_in_at`). */
  setPartnerOptIn(tx: PrismaTx, id: string, at: Date): Promise<PromotionRecord>;
  /**
   * Atomically claim one use of the last available slot (§12.3). Returns true iff
   * a row was updated — false means no uses remain → PROMO_LIMIT_REACHED.
   */
  claimUsage(tx: PrismaTx, id: string): Promise<boolean>;
  /** Return a use (decrement `redeemed_count`) — paired with a redemption release. */
  releaseUsage(tx: PrismaTx, id: string): Promise<void>;
}
