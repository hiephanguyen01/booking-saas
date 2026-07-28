import type { FavoriteRefsResponse, FavoriteTargetKind } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { LoginRequiredDialog } from './login-required-dialog';
import { useFavoritesController } from './use-favorites-controller';

interface FavoritesContextValue {
  isAuthenticated: boolean;
  locale: Locale;
  has: (kind: FavoriteTargetKind, id: string) => boolean;
  toggle: (kind: FavoriteTargetKind, id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function useFavoritesContext(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorite must be used within a <FavoritesProvider>');
  return ctx;
}

/**
 * Owns favorite context and user-facing feedback for the whole tenant subtree.
 * Optimism, debounce and serialized writes live in useFavoritesController.
 */
export function FavoritesProvider({
  isAuthenticated,
  refs,
  locale,
  children,
}: {
  isAuthenticated: boolean;
  refs: FavoriteRefsResponse;
  locale: Locale;
  children: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { has, toggle, loginOpen, setLoginOpen, writeError } = useFavoritesController({
    isAuthenticated,
    refs,
    locale,
  });
  const value = useMemo<FavoritesContextValue>(
    () => ({ isAuthenticated, locale, has, toggle }),
    [isAuthenticated, locale, has, toggle],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <LoginRequiredDialog open={loginOpen} onOpenChange={setLoginOpen} locale={locale} />
      {writeError ? (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[90vw] rounded-md bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground shadow-lg"
        >
          {t('favorites.saveError')}
        </div>
      ) : null}
    </FavoritesContext.Provider>
  );
}

/** Heart state + toggle for one target. Optimistic + debounced (see provider). */
export function useFavorite(
  kind: FavoriteTargetKind,
  id: string,
): { selected: boolean; toggle: () => void } {
  const { has, toggle } = useFavoritesContext();
  return { selected: has(kind, id), toggle: () => toggle(kind, id) };
}
