import type { FavoriteRefsResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useMemo, type ReactNode } from 'react';
import {
  FavoritesContext,
  type FavoritesContextValue,
} from '~/features/favorites/lib/favorites-context';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { LoginRequiredDialog } from './login-required-dialog';
import { useFavoritesController } from '~/features/favorites/hooks/use-favorites-controller';

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
