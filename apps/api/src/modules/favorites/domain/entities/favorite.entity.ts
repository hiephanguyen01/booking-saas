import type { FavoriteTargetKind } from '@booking/contracts';

/**
 * Favorite aggregate root — one customer's heart on exactly one storefront target
 * (a published listing XOR a published listing group) inside one tenant.
 *
 * There is no lifecycle to model: a heart either exists or it does not, and both
 * transitions are idempotent. So the aggregate owns exactly one thing — assembling a
 * valid new favorite:
 *   - the XOR target shaping (`listingId` XOR `groupId`) that used to be a pair of
 *     ternaries inside the repository;
 *   - the denormalized `partnerId`, a CREATION-TIME snapshot of the target's owner
 *     (never re-validated later — a listing that changes hands does not invalidate
 *     existing hearts).
 *
 * NOT owned here (deliberately):
 *   - "the target must exist and be published": resolved by the repository's
 *     RLS-scoped ACL read, which hands back a {@link FavoritableTarget} only when the
 *     rule holds — the aggregate cannot see other modules' tables;
 *   - idempotency: the partial unique indexes + the P2002 swallow in the repository are
 *     the real arbiter (a domain-side pre-check would be TOCTOU);
 *   - `createdAt`: the DB clock stamps it (`DEFAULT CURRENT_TIMESTAMP`);
 *   - the XOR constraint itself: `favorites_one_target_check` in SQL stays the backstop —
 *     this factory just cannot produce a row that violates it.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** A target that passed the repository's exists-and-published check, with its owner. */
export interface FavoritableTarget {
  target: FavoriteTargetKind;
  targetId: string;
  partnerId: string;
}

/** Validated insert payload for a new heart (id/createdAt assigned by the DB). */
export interface NewFavorite {
  tenantId: string;
  customerId: string;
  partnerId: string;
  listingId: string | null;
  groupId: string | null;
}

export class Favorite {
  private constructor() {}

  /** Assemble a new heart from a favoritable target — XOR holds by construction. */
  static open(input: {
    tenantId: string;
    customerId: string;
    target: FavoritableTarget;
  }): NewFavorite {
    const { target } = input;
    return {
      tenantId: input.tenantId,
      customerId: input.customerId,
      partnerId: target.partnerId,
      listingId: target.target === 'listing' ? target.targetId : null,
      groupId: target.target === 'group' ? target.targetId : null,
    };
  }
}
