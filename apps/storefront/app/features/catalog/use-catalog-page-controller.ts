import { useLocation, useNavigation, useOutletContext, useSearchParams } from 'react-router';
import { isReadNavigationMethod, useMinimumPending } from '~/lib/use-minimum-pending';
import type { StorefrontContext } from '~/root';
import type { SearchSort } from '~/features/search/search-state';

const SORT_OPTIONS = [
  { value: 'relevance', labelKey: 'sort.relevance' },
  { value: 'bookings-desc', labelKey: 'sort.bookings' },
  { value: 'price-asc', labelKey: 'sort.priceAsc' },
] as const satisfies readonly { value: SearchSort; labelKey: string }[];

export type CatalogSortItem = {
  value: SearchSort;
  labelKey: (typeof SORT_OPTIONS)[number]['labelKey'];
  active: boolean;
  href: string;
};

export function useCatalogPageController({
  typeSlug,
  attributeSchema,
  activeSort,
  availableSorts,
}: {
  typeSlug: string;
  attributeSchema: readonly { type: string; key: string }[];
  activeSort: SearchSort;
  availableSorts: readonly SearchSort[];
}) {
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const location = useLocation();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const pending = useMinimumPending(
    navigation.state === 'loading' &&
      navigation.location?.pathname === location.pathname &&
      isReadNavigationMethod(navigation.formMethod),
  );
  const booleanFacetKeys = attributeSchema
    .filter((field) => field.type === 'boolean')
    .map((field) => `attr.${field.key}`);
  const sortItems: CatalogSortItem[] = SORT_OPTIONS.filter((option) =>
    availableSorts.includes(option.value),
  ).map((option) => {
    const next = new URLSearchParams(searchParams);
    if (option.value === 'relevance') next.delete('sort');
    else next.set('sort', option.value);
    next.delete('page');

    return {
      ...option,
      active: activeSort === option.value,
      href: `?${next.toString()}`,
    };
  });

  return {
    listingTypes,
    pending,
    booleanFacetKeys,
    searchFormKey: `${typeSlug}:${location.search}`,
    sortItems,
  };
}
