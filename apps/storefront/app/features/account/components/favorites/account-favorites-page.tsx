import { Button } from '@booking/ui/components/ui/button';
import { Heart } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import {
  AccountListState,
  AccountTypeTabs,
} from '~/features/account/components/shared/account-primitives';
import { MobileAccountListingCollection } from '~/features/account/components/shared/mobile-account-listing-collection';
import {
  FavoriteDiscoveryListingCard,
} from '~/features/favorites/components/favorite-cards';
import { useAccountTypeFilter } from '~/features/account/hooks/use-account-type-filter';
import type { loadAccountFavoritesRoute } from '~/features/account/server/account-favorites-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

export function AccountFavoritesPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountFavoritesRoute>;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { listingTypes } = useOutletContext<AccountOutletContext>();
  const { isAllSelected, isTypeSelected, selectAll, selectType, visibleItems } =
    useAccountTypeFilter(loaderData.items, (item) => item.listing.listingTypeSlug);
  const tabs = [
    { key: 'all', label: t('favorites.all'), active: isAllSelected, onSelect: selectAll },
    ...listingTypes.map((type) => ({
      key: type.id,
      label: type.name,
      active: isTypeSelected(type.slug),
      onSelect: () => selectType(type.slug),
    })),
  ];

  const content = loaderData.loadFailed ? (
    <AccountListState icon={Heart} tone="destructive" message={t('favorites.loadError')} />
  ) : visibleItems.length > 0 ? (
    <div className="grid grid-cols-3 gap-5">
      {visibleItems.map((item) => (
        <FavoriteDiscoveryListingCard
          key={`${item.listing.kind}:${item.listing.id}`}
          item={item}
        />
      ))}
    </div>
  ) : (
    <AccountListState
      icon={Heart}
      message={t('favorites.empty')}
      action={
        <Button asChild>
          <Link to={storefrontPaths.home(loaderData.locale)}>{t('favorites.explore')}</Link>
        </Button>
      }
    />
  );

  return (
    <>
      <MobileAccountListingCollection
        filterLabel={t('favorites.filterLabel')}
        tabs={tabs}
        resultCount={loaderData.loadFailed ? undefined : visibleItems.length}
      >
        {loaderData.loadFailed ? (
          <AccountListState icon={Heart} tone="destructive" message={t('favorites.loadError')} />
        ) : visibleItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {visibleItems.map((item) => (
              <FavoriteDiscoveryListingCard
                key={`${item.listing.kind}:${item.listing.id}`}
                item={item}
              />
            ))}
          </div>
        ) : (
          <AccountListState
            icon={Heart}
            message={t('favorites.empty')}
            action={
              <Button asChild>
                <Link to={storefrontPaths.home(loaderData.locale)}>{t('favorites.explore')}</Link>
              </Button>
            }
          />
        )}
      </MobileAccountListingCollection>

      <div className="hidden flex-col gap-(--sf-section-gap) py-2 font-studio md:flex md:gap-4">
        <h1 className="text-base font-semibold leading-6 text-foreground">
          {t('favorites.title')}
        </h1>

        <div className="flex flex-col gap-(--sf-section-gap) md:gap-3">
          <AccountTypeTabs label={t('favorites.filterLabel')} tabs={tabs} />
          {content}
        </div>
      </div>
    </>
  );
}
