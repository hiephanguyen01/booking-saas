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
import { Link } from 'react-router';
import { CatalogResultSkeleton } from '~/components/loading-skeletons';
import type { loadCatalogRoute } from '~/features/catalog/server/catalog-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { NsI18n, useTranslation } from '@booking/i18n';
import { FavoriteSearchResultCard } from '~/features/favorites/components/favorite-cards';
import { SearchForm } from '~/features/search/components/search-form';
import { searchResultContext } from '~/features/search/lib/search-state';
import { CatalogPagination } from './catalog-pagination';
import { FilterPanel } from './filter-panel';
import {
  type CatalogSortItem,
  useCatalogPageController,
} from '~/features/catalog/hooks/use-catalog-page-controller';
import { MobileCatalogPage } from './mobile-catalog-page';

export interface CatalogPageProps {
  loaderData: ServerDataFrom<typeof loadCatalogRoute>;
  params: { locale: string; typeSlug: string };
}

export function CatalogPage({ loaderData, params }: CatalogPageProps) {
  const { type, search, state } = loaderData;
  // Identical for every card on the page, so derived once here rather than 48 times.
  const resultContext = searchResultContext(state);
  const { t } = useTranslation([NsI18n.Catalog, NsI18n.Common]);
  const { listingTypes, pending, booleanFacetKeys, searchFormKey, sortItems } =
    useCatalogPageController({
      typeSlug: params.typeSlug,
      attributeSchema: type.attributeSchema,
      activeSort: state.sort,
      availableSorts: search.sortOptions,
    });

  return (
    // Plain divs: root.tsx already wraps the outlet in the page's one <main>.
    <>
      <MobileCatalogPage
        loaderData={loaderData}
        params={params}
        listingTypes={listingTypes}
        pending={pending}
        booleanFacetKeys={booleanFacetKeys}
        searchFormKey={searchFormKey}
        sortItems={sortItems}
        resultContext={resultContext}
      />
      <div className="hidden bg-muted/20 pb-20 font-studio md:block">
        <SearchForm
          // SearchForm owns uncontrolled inputs. Remount from the complete URL so
          // browser history and query-only navigations cannot leave stale values.
          key={searchFormKey}
          listingTypes={listingTypes}
          currentType={params.typeSlug}
          initialState={state}
          locations={search.locations}
          variant="bar"
          typeChangeBehavior="navigate-to-catalog"
        />

        <div className="mx-auto grid max-w-292.5 gap-8 px-4 py-8 lg:grid-cols-[270px_minmax(0,1fr)] lg:px-0">
          <aside className="hidden lg:block">
            <FilterPanel state={state} facets={search.facets} booleanFacetKeys={booleanFacetKeys} />
          </aside>

          <section aria-labelledby="search-results-title" aria-busy={pending} className="min-w-0">
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
                  <Button size="control" variant="outline" className="lg:hidden">
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

            <SortBar items={sortItems} />

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
                    context={resultContext}
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
    </>
  );
}

function SortBar({ items }: { items: readonly CatalogSortItem[] }) {
  const { t } = useTranslation(NsI18n.Catalog);
  return (
    <div
      className="mb-6 flex items-center gap-4 overflow-x-auto pb-1"
      aria-label={t('sort.ariaLabel')}
    >
      <span className="shrink-0 text-sm font-medium text-foreground">{t('sort.label')}</span>
      <div className="flex gap-3">
        {items.map((item) => (
          <SortChip
            key={item.value}
            label={t(item.labelKey)}
            href={item.href}
            active={item.active}
          />
        ))}
      </div>
    </div>
  );
}

function SortChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Button
      asChild
      size="control"
      variant="outline"
      className={
        active
          ? 'rounded-full border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
          : 'rounded-full hover:bg-transparent hover:text-primary'
      }
    >
      <Link to={href} aria-current={active ? 'true' : undefined}>
        {label}
      </Link>
    </Button>
  );
}
