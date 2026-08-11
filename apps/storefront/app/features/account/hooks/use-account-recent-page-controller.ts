import { useFetcher } from 'react-router';
import { viewedRefKey } from '~/features/account/lib/recently-viewed-ref';
import { useAccountTypeFilter } from '~/features/account/hooks/use-account-type-filter';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';

/**
 * Removing an entry only rewrites a cookie, so the round trip is fast — but it
 * is still a round trip. The in-flight submission is read back out of the
 * fetcher to drop the card immediately, which is what makes the X feel like a
 * dismissal rather than a request.
 */
export function useAccountRecentPageController(items: DiscoveryListingCardData[]) {
  const fetcher = useFetcher();
  const pending = fetcher.formData;
  const pendingIntent = pending?.get('intent');
  const pendingKey = pending?.get('key');

  const settled =
    pendingIntent === 'clear'
      ? []
      : pendingIntent === 'remove'
        ? items.filter((item) => keyOf(item) !== pendingKey)
        : items;

  const filter = useAccountTypeFilter(settled, (item) => item.listing.listingTypeSlug);

  return {
    ...filter,
    hasItems: settled.length > 0,
    keyOf,
    clearAll: () => submit(fetcher, { intent: 'clear' }),
    removeItem: (item: DiscoveryListingCardData) =>
      submit(fetcher, { intent: 'remove', key: keyOf(item) }),
  };
}

function keyOf(item: DiscoveryListingCardData): string {
  return viewedRefKey({ kind: item.listing.kind, slug: item.listing.slug });
}

function submit(
  fetcher: ReturnType<typeof useFetcher>,
  fields: Record<string, string>,
): void {
  fetcher.submit(fields, { method: 'post' });
}
