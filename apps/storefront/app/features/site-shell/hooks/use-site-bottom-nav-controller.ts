import type { PublicListingTypeResponse } from '@booking/contracts';
import { useLocation } from 'react-router';
import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';

export type BottomNavKey = 'home' | 'search' | 'bookings' | 'favorites' | 'account';

export interface BottomNavItem {
  key: BottomNavKey;
  to: string;
  active: boolean;
}

/**
 * The five mobile tabs, their destinations and which one is current.
 *
 * Three destinations depend on whether anyone is signed in. "Đặt chỗ" points at
 * the account's booking list for a signed-in visitor and at the guest lookup
 * (`/bookings`, booking code + email OTP) otherwise — the tab must work for the
 * guest-checkout flow, which is the majority of storefront traffic. "Đã lưu" and
 * the account tab send a signed-out visitor to the login page with a return path,
 * because neither surface exists without a session.
 */
export function useSiteBottomNavController({
  listingTypes,
  locale,
  signedIn,
}: {
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  signedIn: boolean;
}): BottomNavItem[] {
  const location = useLocation();
  const pathname = location.pathname;
  const redirectTo = `${pathname}${location.search}`;
  const home = storefrontPaths.home(locale);

  // The storefront's search surface *is* the catalog/filter page, which needs a
  // type. A tenant with no active listing type has nothing to search, so the tab
  // degrades to the home page rather than to a broken URL.
  const firstType = listingTypes[0];
  const search = firstType ? storefrontPaths.catalog(locale, firstType.slug) : home;

  const startsWith = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

  return [
    // Exact match: every other path also starts with `/vi`, so a prefix test here
    // would light up the home tab on every page in the app.
    { key: 'home', to: home, active: pathname === home || pathname === `${home}/` },
    { key: 'search', to: search, active: startsWith(`/${locale}/t`) },
    {
      key: 'bookings',
      to: signedIn ? storefrontPaths.account.bookings(locale) : storefrontPaths.bookings(locale),
      // Both booking surfaces are the same tab as far as a visitor is concerned.
      active: startsWith(`/${locale}/bookings`) || startsWith(`/${locale}/account/bookings`),
    },
    {
      key: 'favorites',
      to: signedIn
        ? storefrontPaths.account.favorites(locale)
        : storefrontPaths.login(locale, redirectTo),
      active: startsWith(`/${locale}/account/favorites`),
    },
    {
      key: 'account',
      to: signedIn
        ? storefrontPaths.account.overview(locale)
        : storefrontPaths.login(locale, redirectTo),
      // `/account/bookings` and `/account/favorites` each have their own tab.
      active:
        startsWith(`/${locale}/account`) &&
        !startsWith(`/${locale}/account/bookings`) &&
        !startsWith(`/${locale}/account/favorites`),
    },
  ];
}
