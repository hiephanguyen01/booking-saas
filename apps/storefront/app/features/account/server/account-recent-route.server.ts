import { loadAccountListingItems } from '~/features/account/server/account-listings.server';

export async function loadAccountRecentRoute(request: Request, locale: 'vi' | 'en') {
  const items = await loadAccountListingItems(request);
  return { locale, items };
}
