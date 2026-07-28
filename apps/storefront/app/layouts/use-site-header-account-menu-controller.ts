import type { Locale } from '@booking/i18n';
import { useFetcher, useLocation } from 'react-router';
import type { AccountMenuSummary } from '~/features/account/account-menu';
import { accountNavItems, type AccountNavKey } from '~/features/account/account-nav';
import { storefrontPaths } from '~/lib/locale-paths';

function formatBadgeCount(count: number | undefined): string | undefined {
  if (!count || count < 1) return undefined;
  return count > 99 ? '99+' : String(count);
}

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
  const badges: Partial<Record<AccountNavKey, string | undefined>> = {
    messages: formatBadgeCount(accountMenuSummary?.unreadMessages),
    reviews: formatBadgeCount(accountMenuSummary?.pendingReviews),
  };
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
