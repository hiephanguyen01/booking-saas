import type { Locale } from '@booking/i18n';
import { useFetcher, useLocation } from 'react-router';
import { accountNavItems } from '../features/account/account-nav';
import { storefrontPaths, switchLocalePath } from '../lib/locale-paths';

export function useSiteHeaderMobileMenuController({
  locale,
  redirectTo,
}: {
  locale: Locale;
  redirectTo: string;
}) {
  const localeFetcher = useFetcher();
  const location = useLocation();
  const nextLocale: Locale = locale === 'vi' ? 'en' : 'vi';
  const localeRedirectTo = switchLocalePath(
    `${location.pathname}${location.search}${location.hash}`,
    nextLocale,
  );

  return {
    accountItems: accountNavItems(locale),
    catalogPath: (listingTypeSlug: string) => storefrontPaths.catalog(locale, listingTypeSlug),
    localeFetcher,
    localeRedirectTo,
    nextLocale,
    paths: {
      becomePartner: storefrontPaths.becomePartner(locale),
      bookings: storefrontPaths.bookings(locale),
      community: storefrontPaths.community(locale),
      home: storefrontPaths.home(locale),
      login: storefrontPaths.login(locale, redirectTo),
      register: storefrontPaths.register(locale),
    },
  };
}
