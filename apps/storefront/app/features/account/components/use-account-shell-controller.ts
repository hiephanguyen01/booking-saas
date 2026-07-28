import type { Locale } from '@booking/i18n';
import { useFetcher } from 'react-router';
import { storefrontPaths } from '~/lib/locale-paths';
import { accountNavItems, type AccountNavKey } from '~/features/account/account-nav';
import type { AccountMenuSummary } from '~/features/account/account-menu';

const ACCOUNT_NAV_GROUP_KEYS: AccountNavKey[][] = [
  ['profile', 'bookings', 'messages', 'reviews'],
  ['favorites', 'recent'],
  ['terms', 'security', 'help'],
];

function formatBadgeCount(count: number | undefined): string | undefined {
  if (!count || count < 1) return undefined;
  return count > 99 ? '99+' : String(count);
}

export function useAccountShellController({
  locale,
  accountMenuSummary,
}: {
  locale: Locale;
  accountMenuSummary: AccountMenuSummary | null;
}) {
  const fetcher = useFetcher();
  const itemByKey = new Map(accountNavItems(locale).map((item) => [item.key, item]));
  const badges: Partial<Record<AccountNavKey, string | undefined>> = {
    messages: formatBadgeCount(accountMenuSummary?.unreadMessages),
    reviews: formatBadgeCount(accountMenuSummary?.pendingReviews),
  };
  const groups = ACCOUNT_NAV_GROUP_KEYS.map((group) =>
    group.flatMap((key) => {
      const item = itemByKey.get(key);
      return item ? [{ ...item, badge: badges[key] }] : [];
    }),
  );

  return {
    fetcher,
    groups,
    logoutAction: storefrontPaths.logout(locale),
  };
}
