import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { PromotionSpec } from '../promotion-discount';

export const PROMOTION_REPOSITORY = Symbol('PROMOTION_REPOSITORY');

/** A full `promotions` row (superset of {@link PromotionSpec}) for admin responses. */
export interface PromotionRecord extends PromotionSpec {
  tenantId: string;
  name: string;
  fundedBy: 'tenant' | 'partner';
  createdAt: Date;
}

export interface CreatePromotionData {
  name: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: bigint;
  maxDiscount: bigint | null;
  appliesTo: 'all' | 'listing';
  appliesToId: string | null;
  minOrderAmount: bigint | null;
  usageLimitTotal: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: 'draft' | 'active' | 'paused';
}

export type UpdatePromotionData = Partial<CreatePromotionData>;

export interface IPromotionRepository {
  create(tx: PrismaTx, tenantId: string, data: CreatePromotionData): Promise<PromotionRecord>;
  update(tx: PrismaTx, id: string, data: UpdatePromotionData): Promise<PromotionRecord>;
  findById(tx: PrismaTx, id: string): Promise<PromotionRecord | null>;
  findByCode(tx: PrismaTx, code: string): Promise<PromotionRecord | null>;
  list(tx: PrismaTx): Promise<PromotionRecord[]>;
  /** Transition a promotion to `ended` (usage history is preserved, §12.2). */
  end(tx: PrismaTx, id: string): Promise<PromotionRecord>;
  /**
   * Atomically claim one use of the last available slot (§12.3). Returns true iff
   * a row was updated — false means no uses remain → PROMO_LIMIT_REACHED.
   */
  claimUsage(tx: PrismaTx, id: string): Promise<boolean>;
  /** Return a use (decrement `redeemed_count`) — paired with a redemption release. */
  releaseUsage(tx: PrismaTx, id: string): Promise<void>;
}
