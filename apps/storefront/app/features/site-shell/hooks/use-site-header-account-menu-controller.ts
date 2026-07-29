import type { Locale } from '@booking/i18n';
import { useFetcher, useLocation } from 'react-router';
import { accountNavBadges, type AccountMenuSummary } from '~/features/account/lib/account-menu';
import { accountNavItems, type AccountNavKey } from '~/features/account/lib/account-nav';
import { storefrontPaths } from '~/constants/paths';

function isAccountItemActive(pathname: string, key: AccountNavKey, to: string): boolean {
  if (pathname === to) return true;
  return key === 'bookings' && pathname.startsWith(`${to}/`);
}

export function useSiteHeaderAccountMenuController({
  locale,
  accountMenuSummary,
}: {
  locale: Locale;
  accountMenuSummary: AccountMenuSummary | null;
}) {
  const fetcher = useFetcher();
  const location = useLocation();
  const badges = accountNavBadges(accountMenuSummary);
  const items = accountNavItems(locale).map((item) => ({
    ...item,
    active: isAccountItemActive(location.pathname, item.key, item.to),
    badge: badges[item.key],
  }));

  return {
    fetcher,
    items,
    logoutAction: storefrontPaths.logout(locale),
  };
}
