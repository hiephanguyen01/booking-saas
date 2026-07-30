import type { RevisionStatus, RevisionTarget } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LISTING_REVISION_REPOSITORY = Symbol('LISTING_REVISION_REPOSITORY');

/**
 * A partner's parked edit of an already-reviewed listing or post (§7.3). The
 * payload is stored opaquely — it is re-validated by the update use-case when a
 * reviewer approves it, so a listing type that changed in the meantime still
 * rejects an incompatible edit.
 */
export interface ListingRevisionRecord {
  id: string;
  tenantId: string;
  targetType: RevisionTarget;
  targetId: string;
  payload: Record<string, unknown>;
  status: RevisionStatus;
  submittedByUserId: string | null;
  submittedAt: Date;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  appliedAt: Date | null;
}

export interface NewListingRevision {
  targetType: RevisionTarget;
  targetId: string;
  payload: Record<string, unknown>;
  submittedByUserId: string | null;
}

/** The decision a reviewer (or the partner, when discarding) writes onto a revision. */
export interface RevisionDecision {
  status: Exclude<RevisionStatus, 'pending'>;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  appliedAt: Date | null;
}

export interface IListingRevisionRepository {
  /** The single waiting edit for a target, if any. */
  findPending(
    tx: PrismaTx,
    targetType: RevisionTarget,
    targetId: string,
  ): Promise<ListingRevisionRecord | null>;
  /**
   * The revision the partner is still working on: the pending one, or the most
   * recent rejection so the form keeps their content and shows the reason.
   */
  findOpen(
    tx: PrismaTx,
    targetType: RevisionTarget,
    targetId: string,
  ): Promise<ListingRevisionRecord | null>;
  findPendingForTargets(
    tx: PrismaTx,
    targetType: RevisionTarget,
    targetIds: readonly string[],
  ): Promise<ListingRevisionRecord[]>;
  listPending(tx: PrismaTx): Promise<ListingRevisionRecord[]>;
  findById(tx: PrismaTx, id: string): Promise<ListingRevisionRecord | null>;
  /** Creates the target's pending revision, or overwrites the existing one. */
  upsertPending(
    tx: PrismaTx,
    tenantId: string,
    data: NewListingRevision,
  ): Promise<ListingRevisionRecord>;
  /** Guarded by the expected status so two reviewers cannot both decide. */
  decide(
    tx: PrismaTx,
    id: string,
    expectedStatus: RevisionStatus,
    decision: RevisionDecision,
  ): Promise<ListingRevisionRecord | null>;
}
