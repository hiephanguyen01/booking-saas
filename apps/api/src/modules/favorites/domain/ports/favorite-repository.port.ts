import type { FavoriteTarget } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { FavoritableTarget, NewFavorite } from '../entities/favorite.entity';

export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

export interface IFavoriteRepository {
  /**
   * The target's owner, but only when the target exists AND is published — the
   * storefront rule, resolved inside the tenant tx under RLS. `null` = not favoritable.
   */
  findFavoritableTarget(tx: PrismaTx, target: FavoriteTarget): Promise<FavoritableTarget | null>;
  /** Idempotent add — a duplicate heart is swallowed via the partial unique index (P2002). */
  add(tx: PrismaTx, favorite: NewFavorite): Promise<void>;
  /** Idempotent remove — removing a missing heart is a no-op. */
  remove(tx: PrismaTx, customerId: string, target: FavoriteTarget): Promise<void>;
}
