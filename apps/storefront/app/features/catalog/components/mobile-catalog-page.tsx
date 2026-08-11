import type { PublicListingTypeResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
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
import { cn } from '@booking/ui/lib/utils';
import { ListFilter, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ListingTypeGlyph } from '~/components/listing-type-glyph';
import type { CatalogSortItem } from '~/features/catalog/hooks/use-catalog-page-controller';
import { FavoriteSearchResultCard } from '~/features/favorites/components/favorite-cards';
import { SearchForm } from '~/features/search/components/search-form';
import type {
  SearchResultContext,
  StorefrontSearchState,
} from '~/features/search/lib/search-state';
import { buildTypeChangeCatalogHrefFromState } from '~/features/search/lib/type-change-navigation';
import { useLocale } from '~/hooks/use-locale';
import type { CatalogPageProps } from './catalog-page';
import { CatalogPagination } from './catalog-pagination';
import { CatalogResultSkeleton } from './catalog-result-skeleton';
import { FilterPanel } from './filter-panel';
import { PANEL_SURFACE } from '~/constants/surfaces';

export function MobileCatalogPage({
  loaderData,
  params,
  listingTypes,
  pending,
  booleanFacetKeys,
  searchFormKey,
  sortItems,
  resultContext,
}: CatalogPageProps & {
  listingTypes: PublicListingTypeResponse[];
  pending: boolean;
  booleanFacetKeys: string[];
  searchFormKey: string;
  sortItems: readonly CatalogSortItem[];
  resultContext: SearchResultContext;
}) {
  const { type, search, state } = loaderData;
  const { t } = useTranslation([NsI18n.Catalog, NsI18n.Common]);
  const locale = useLocale();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilterCount = countActiveCatalogFilters(searchParams);
  const summary = mobileSearchSummary(state, search.locations, locale, t);

  // A GET submission updates the URL in-place; closing here avoids coupling the
  // existing search and filter forms to drawer state.
  useEffect(() => {
    setEditOpen(false);
    setFilterOpen(false);
  }, [location.search]);

  return (
    <div className="min-h-dvh bg-muted/30 pb-5 font-studio md:hidden">
      <header className="sticky top-0 z-40 bg-foreground text-background shadow-lg">
        <div className="flex items-center gap-1 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <nav
            aria-label={t('common:home.listingTypes')}
            className="sf-scroll-x flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {listingTypes.map((listingType) => {
              const active = listingType.slug === params.typeSlug;
              return (
                <Link
                  key={listingType.id}
                  to={buildTypeChangeCatalogHrefFromState(locale, state, listingType)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'border-background bg-background text-foreground'
                      : 'border-background/20 text-background/70 hover:border-background/45 hover:text-background',
                  )}
                >
                  <ListingTypeGlyph type={listingType} className="size-4" />
                  {listingType.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5 px-3 pt-3 pb-3">
          <Drawer open={editOpen} onOpenChange={setEditOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto min-h-13 min-w-0 flex-1 justify-start gap-2.5 rounded-xl bg-background px-3.5 py-2 text-left text-foreground hover:bg-background/95 hover:text-foreground"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-5 font-bold">
                    {state.q || type.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] leading-4 font-normal text-muted-foreground">
                    {summary}
                  </span>
                </span>
                <Search className="size-5 shrink-0 text-muted-foreground" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[92dvh]">
              <DrawerHeader className="text-left">
                <DrawerTitle>{t('mobile.editTitle')}</DrawerTitle>
                <DrawerDescription>{t('mobile.editDescription')}</DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto">
                <SearchForm
                  key={searchFormKey}
                  listingTypes={listingTypes}
                  currentType={params.typeSlug}
                  initialState={state}
                  locations={search.locations}
                  variant="mobile-sheet"
                  typeChangeBehavior="navigate-to-catalog"
                  onSubmit={() => window.setTimeout(() => setEditOpen(false), 0)}
                />
              </div>
            </DrawerContent>
          </Drawer>

          <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
            <DrawerTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                aria-label={t('filters.open')}
                className="relative size-13 shrink-0 rounded-xl border-background/30 bg-background/10 text-background hover:bg-background/20 hover:text-background"
              >
                <ListFilter className="size-5" />
                {activeFilterCount ? (
                  <span className="absolute -top-1 -right-1 flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4.5 font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[92dvh]">
              <DrawerHeader className="text-left">
                <DrawerTitle>{t('filters.drawerTitle')}</DrawerTitle>
                <DrawerDescription>{t('filters.drawerDescription')}</DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-6">
                <FilterPanel
                  state={state}
                  facets={search.facets}
                  booleanFacetKeys={booleanFacetKeys}
                  onSubmit={() => window.setTimeout(() => setFilterOpen(false), 0)}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </header>

      <section aria-labelledby="mobile-search-results-title" aria-busy={pending}>
        <h1 id="mobile-search-results-title" className="sr-only">
          {t('resultsCount', { count: search.total })}
        </h1>
        <div className="bg-background/95 py-2.5 backdrop-blur-sm">
          <div className="sf-scroll-x flex items-center gap-2 overflow-x-auto px-3">
            <span className="shrink-0 text-[11.5px] text-muted-foreground">{t('sort.label')}</span>
            {sortItems.map((item) => (
              <Button
                key={item.value}
                asChild
                size="sm"
                variant="outline"
                className={cn(
                  'shrink-0 rounded-full text-xs',
                  item.active &&
                    'border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                )}
              >
                <Link to={item.href} aria-current={item.active ? 'true' : undefined}>
                  {t(item.labelKey)}
                </Link>
              </Button>
            ))}
          </div>
        </div>

        <p className="px-3 pt-3 text-[11.5px] text-muted-foreground">
          {t('resultsCount', { count: search.total })}
        </p>

        <div className="flex flex-col gap-(--sf-section-gap) px-3 pt-(--sf-section-gap) pb-4">
          {pending ? (
            <div role="status" aria-live="polite" aria-label={t('common:loading')}>
              <div className="flex flex-col gap-(--sf-section-gap)" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <CatalogResultSkeleton key={index} />
                ))}
              </div>
            </div>
          ) : search.items.length === 0 ? (
            <Empty className={cn(PANEL_SURFACE, 'bg-background p-(--sf-surface-pad)')}>
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
            search.items.map((listing) => (
              <FavoriteSearchResultCard
                key={`${listing.kind}:${listing.id}`}
                listing={listing}
                context={resultContext}
              />
            ))
          )}
        </div>

        {!pending && search.totalPages > 1 ? (
          <div className="px-3 pb-6">
            <CatalogPagination currentPage={search.page} totalPages={search.totalPages} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function countActiveCatalogFilters(params: URLSearchParams): number {
  const scalarKeys = ['minPrice', 'maxPrice', 'minRating', 'location', 'area'] as const;
  let count = scalarKeys.filter((key) => Boolean(params.get(key)?.trim())).length;
  count += params
    .getAll('amenities')
    .flatMap((value) => value.split(','))
    .filter(Boolean).length;

  for (const [name, value] of params) {
    if (name.startsWith('attr.') && value.trim()) count += 1;
  }
  return count;
}

function mobileSearchSummary(
  state: StorefrontSearchState,
  locations: Array<string | { value: string; label: string }>,
  locale: 'vi' | 'en',
  t: (
    key: 'mobile.anyLocation' | 'mobile.oneGuest' | 'mobile.guestCount',
    vars?: Record<string, string | number>,
  ) => string,
): string {
  const location = locations.find((option) =>
    typeof option === 'string' ? option === state.location : option.value === state.location,
  );
  const locationLabel =
    typeof location === 'string' ? location : (location?.label ?? state.location ?? '');
  const parts = [locationLabel || t('mobile.anyLocation')];
  const formatter = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
  const dateLabel = (value: string) => formatter.format(new Date(`${value}T12:00:00Z`));

  if (state.mode === 'hourly' && state.hasDateSelection) {
    parts.push(
      state.hasTimeSelection
        ? `${dateLabel(state.date)}, ${state.startTime}–${state.endTime}`
        : dateLabel(state.date),
    );
  } else if (state.hasDailyRange) {
    parts.push(`${dateLabel(state.from)}–${dateLabel(state.to)}`);
  }
  parts.push(
    t(state.guests === 1 ? 'mobile.oneGuest' : 'mobile.guestCount', { count: state.guests }),
  );
  return parts.join(' · ');
}
