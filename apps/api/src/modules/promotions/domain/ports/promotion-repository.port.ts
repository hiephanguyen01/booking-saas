import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { PromoAppliesTo, PromoFundedBy, PromoTimeWindow, PromotionSpec } from '../promotion-discount';

export const PROMOTION_REPOSITORY = Symbol('PROMOTION_REPOSITORY');

/** A full `promotions` row (superset of {@link PromotionSpec}) for admin responses. */
export interface PromotionRecord extends PromotionSpec {
  tenantId: string;
  name: string;
  createdByPartnerId: string | null;
  fundingPartnerId: string | null;
  createdAt: Date;
}

export interface CreatePromotionData {
  name: string;
  /** null = an auto-applied campaign (no code). */
  code: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: bigint;
  maxDiscount: bigint | null;
  fundedBy: PromoFundedBy;
  appliesTo: PromoAppliesTo;
  appliesToId: string | null;
  minOrderAmount: bigint | null;
  firstBookingOnly: boolean;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  timeWindows: PromoTimeWindow[] | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: 'draft' | 'active' | 'paused';
  createdByPartnerId: string | null;
  /** The partner bearing the cost for a `funded_by = partner` promo (resolved from scope). */
  fundingPartnerId: string | null;
  /** Opt-in timestamp — non-null for partner-created codes (auto-opted-in), null while pending. */
  partnerOptInAt: Date | null;
}

export type UpdatePromotionData = Partial<CreatePromotionData>;

export interface IPromotionRepository {
  create(tx: PrismaTx, tenantId: string, data: CreatePromotionData): Promise<PromotionRecord>;
  update(tx: PrismaTx, id: string, data: UpdatePromotionData): Promise<PromotionRecord>;
  findById(tx: PrismaTx, id: string): Promise<PromotionRecord | null>;
  findByCode(tx: PrismaTx, code: string): Promise<PromotionRecord | null>;
  list(tx: PrismaTx): Promise<PromotionRecord[]>;
  /** Promotions created by a given partner (their own codes, §12.2 Phase 2). */
  listByPartner(tx: PrismaTx, partnerId: string): Promise<PromotionRecord[]>;
  /** Active, code-less auto-applied campaigns for the tenant (§12.1 Phase 2). */
  listActiveAutoCampaigns(tx: PrismaTx): Promise<PromotionRecord[]>;
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
