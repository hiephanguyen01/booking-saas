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
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';
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
    useAccountTypeFilter(loaderData.items, (item) => item.listingTypeSlug);

  return (
    <div className="flex flex-col gap-4 py-2 font-studio">
      <h1 className="text-base font-semibold leading-6 text-foreground">{t('favorites.title')}</h1>

      <div className="flex flex-col gap-3">
        <AccountTypeTabs
          label={t('favorites.filterLabel')}
          tabs={[
            { key: 'all', label: t('favorites.all'), active: isAllSelected, onSelect: selectAll },
            ...listingTypes.map((type) => ({
              key: type.id,
              label: type.name,
              active: isTypeSelected(type.slug),
              onSelect: () => selectType(type.slug),
            })),
          ]}
        />

        {loaderData.loadFailed ? (
          <AccountListState icon={Heart} tone="destructive" message={t('favorites.loadError')} />
        ) : visibleItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => (
              <FavoriteListingCard key={item.id} listing={item} className="min-h-[394px]" />
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
      </div>
    </div>
  );
}
