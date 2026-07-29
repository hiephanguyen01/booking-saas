import type { AccountNavKey } from './account-nav';

export interface AccountMenuSummary {
  unreadMessages: number;
  pendingReviews: number;
}

export type AccountNavBadges = Partial<Record<AccountNavKey, string | undefined>>;

function badgeCount(count: number | undefined): string | undefined {
  if (!count || count < 1) return undefined;
  return count > 99 ? '99+' : String(count);
}

/** The counters the account nav renders, in the badge form both surfaces show. */
export function accountNavBadges(summary: AccountMenuSummary | null): AccountNavBadges {
  return {
    messages: badgeCount(summary?.unreadMessages),
    reviews: badgeCount(summary?.pendingReviews),
  };
}
