import { Button } from '@booking/ui/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { SlidersHorizontal } from 'lucide-react';
import {
  Link,
  useLocation,
  useNavigation,
  useOutletContext,
  useSearchParams,
} from 'react-router';
import { CatalogResultSkeleton } from '../../components/loading-skeletons';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { isReadNavigationMethod, useMinimumPending } from '../../lib/use-minimum-pending';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/catalog';
import type { SearchSort, StorefrontSearchState } from '../search/search-state';
import { SearchForm } from '../search/search-form';
import { CatalogPagination } from './components/catalog-pagination';
import { FilterPanel } from './components/filter-panel';
import { FavoriteSearchResultCard } from '../favorites/components/favorite-cards';

/**
 * Only the orders `composeSearchResults()` actually applies.
 *
 * "Đặt nhiều nhất" and "Đánh giá nhiều nhất" chips used to sit here too: they
 * rewrote the URL and rendered active, but nothing sorted on them — and there is
 * no booking-count or rating data behind either.
 */
const SORT_OPTIONS = [
  { value: 'relevance', labelKey: 'sort.relevance' },
  { value: 'bookings-desc', labelKey: 'sort.bookings' },
  { value: 'price-asc', labelKey: 'sort.priceAsc' },
] as const satisfies readonly { value: SearchSort; labelKey: string }[];

export function CatalogPage({ loaderData, params }: Route.ComponentProps) {
  const { type, search, state } = loaderData;
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation([NsI18n.Catalog, NsI18n.Common]);
  const location = useLocation();
  const navigation = useNavigation();
  const pending = useMinimumPending(
    navigation.state === 'loading' &&
      navigation.location?.pathname === location.pathname &&
      isReadNavigationMethod(navigation.formMethod),
  );
  const booleanFacetKeys = type.attributeSchema
    .filter((field) => field.type === 'boolean')
    .map((field) => `attr.${field.key}`);

  return (
    // A plain <div>: root.tsx already wraps the outlet in the page's one <main>.
    <div className="bg-muted/20 pb-20 font-studio">
      <SearchForm
        // SearchForm owns uncontrolled inputs. Remount from the complete URL so
        // browser history and query-only navigations cannot leave stale values.
        key={`${params.typeSlug}:${location.search}`}
        listingTypes={listingTypes}
        currentType={params.typeSlug}
        initialState={state}
        locations={search.locations}
        variant="bar"
      />

      <div className="mx-auto grid max-w-292.5 gap-8 px-4 py-8 lg:grid-cols-[270px_minmax(0,1fr)] lg:px-0">
        <aside className="hidden lg:block">
          <FilterPanel state={state} facets={search.facets} booleanFacetKeys={booleanFacetKeys} />
        </aside>

        <section
          aria-labelledby="search-results-title"
          aria-busy={pending}
          className="min-w-0"
        >
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h1 id="search-results-title" className="text-2xl font-semibold text-foreground">
                {t('resultsTitle', { name: type.name })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('resultsCount', { count: search.total })}
              </p>
            </div>
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline" className="lg:hidden">
                  <SlidersHorizontal data-icon="inline-start" /> {t('filters.open')}
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[92vh]">
                <DrawerHeader>
                  <DrawerTitle>{t('filters.drawerTitle')}</DrawerTitle>
                  <DrawerDescription>{t('filters.drawerDescription')}</DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-8">
                  <FilterPanel
                    state={state}
                    facets={search.facets}
                    booleanFacetKeys={booleanFacetKeys}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          <SortBar state={state} options={search.sortOptions} />

          {pending ? (
            <div
              className="flex flex-col gap-6"
              role="status"
              aria-live="polite"
              aria-busy="true"
              aria-label={t('common:loading')}
            >
              {Array.from({ length: 4 }, (_, index) => (
                <CatalogResultSkeleton key={index} />
              ))}
            </div>
          ) : search.items.length === 0 ? (
            <Empty className="border bg-background py-20">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SlidersHorizontal />
                </EmptyMedia>
                <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
                <EmptyDescription>{t('emptyDescription')}</EmptyDescription>
              </EmptyHeader>
              <Button asChild variant="outline">
                <Link to="?">{t('clearFilters')}</Link>
              </Button>
            </Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {search.items.map((listing) => (
                <FavoriteSearchResultCard
                  key={`${listing.kind}:${listing.id}`}
                  listing={listing}
                  state={state}
                />
              ))}
            </div>
          )}

          {!pending && search.totalPages > 1 ? (
            <CatalogPagination currentPage={search.page} totalPages={search.totalPages} />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SortBar({ state, options }: { state: StorefrontSearchState; options: SearchSort[] }) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(NsI18n.Catalog);
  return (
    <div
      className="mb-6 flex items-center gap-4 overflow-x-auto pb-1"
      aria-label={t('sort.ariaLabel')}
    >
      <span className="shrink-0 text-sm font-medium text-foreground">{t('sort.label')}</span>
      <div className="flex gap-3">
        {SORT_OPTIONS.filter((option) => options.includes(option.value)).map((option) => (
          <SortChip
            key={option.value}
            label={t(option.labelKey)}
            value={option.value}
            active={state.sort === option.value}
            params={searchParams}
          />
        ))}
      </div>
    </div>
  );
}

function SortChip({
  label,
  value,
  active,
  params,
}: {
  label: string;
  value: SearchSort;
  active: boolean;
  params: URLSearchParams;
}) {
  const next = new URLSearchParams(params);
  if (value === 'relevance') next.delete('sort');
  else next.set('sort', value);
  next.delete('page');
  return (
    <Button
      asChild
      variant="outline"
      className={
        active
          ? 'rounded-full border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
          : 'rounded-full hover:bg-transparent hover:text-primary'
      }
    >
      <Link to={`?${next.toString()}`} aria-current={active ? 'true' : undefined}>
        {label}
      </Link>
    </Button>
  );
}
