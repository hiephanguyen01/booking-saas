import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const REVIEW_AGGREGATE_PROJECTOR = Symbol('REVIEW_AGGREGATE_PROJECTOR');

export interface IReviewAggregateProjector {
  project(
    tx: PrismaTx,
    listingId: string,
    groupId: string | null,
  ): Promise<void>;
}
