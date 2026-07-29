import type { Locale } from '@booking/i18n';
import { useFetcher } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { accountNavItems, type AccountNavKey } from '~/features/account/lib/account-nav';
import { accountNavBadges, type AccountMenuSummary } from '~/features/account/lib/account-menu';

const ACCOUNT_NAV_GROUP_KEYS: AccountNavKey[][] = [
  ['profile', 'bookings', 'messages', 'reviews'],
  ['favorites', 'recent'],
  ['terms', 'security', 'help'],
];

export function useAccountShellController({
  locale,
  accountMenuSummary,
}: {
  locale: Locale;
  accountMenuSummary: AccountMenuSummary | null;
}) {
  const fetcher = useFetcher();
  const itemByKey = new Map(accountNavItems(locale).map((item) => [item.key, item]));
  const badges = accountNavBadges(accountMenuSummary);
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
