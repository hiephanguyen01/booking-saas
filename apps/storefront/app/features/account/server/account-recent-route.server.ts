import type { AccountListingItem } from '~/features/account/lib/account-listing-item';

export function loadAccountRecentRoute(locale: 'vi' | 'en'): {
  locale: 'vi' | 'en';
  items: AccountListingItem[];
} {
  return { locale, items: [] };
}
