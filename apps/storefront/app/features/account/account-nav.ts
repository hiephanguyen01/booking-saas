import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';

export type AccountNavKey =
  | 'profile'
  | 'bookings'
  | 'messages'
  | 'reviews'
  | 'favorites'
  | 'recent'
  | 'terms'
  | 'security'
  | 'help';

export function accountNavItems(locale: Locale): Array<{ key: AccountNavKey; to: string }> {
  return [
    { key: 'profile', to: storefrontPaths.account.profile(locale) },
    { key: 'bookings', to: storefrontPaths.account.bookings(locale) },
    { key: 'messages', to: storefrontPaths.account.messages(locale) },
    { key: 'reviews', to: storefrontPaths.account.reviews(locale) },
    { key: 'favorites', to: storefrontPaths.account.favorites(locale) },
    { key: 'recent', to: storefrontPaths.account.recent(locale) },
    { key: 'terms', to: storefrontPaths.account.terms(locale) },
    { key: 'security', to: storefrontPaths.account.security(locale) },
    { key: 'help', to: storefrontPaths.account.help(locale) },
  ];
}

export function userInitials(fullName: string): string {
  return (
    fullName
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part.charAt(0).toLocaleUpperCase())
      .join('') || 'BK'
  );
}
