import type { FavoriteTargetKind } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { createContext } from 'react';

export interface FavoritesContextValue {
  isAuthenticated: boolean;
  locale: Locale;
  has: (kind: FavoriteTargetKind, id: string) => boolean;
  toggle: (kind: FavoriteTargetKind, id: string) => void;
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(null);
