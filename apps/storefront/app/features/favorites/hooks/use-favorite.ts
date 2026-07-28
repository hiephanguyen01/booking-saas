import type { FavoriteTargetKind } from '@booking/contracts';
import { useContext } from 'react';
import { FavoritesContext } from '~/features/favorites/lib/favorites-context';

/** Heart state + toggle for one target. Optimistic + debounced (see provider). */
export function useFavorite(
  kind: FavoriteTargetKind,
  id: string,
): { selected: boolean; toggle: () => void } {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorite must be used within a <FavoritesProvider>');
  return { selected: context.has(kind, id), toggle: () => context.toggle(kind, id) };
}
