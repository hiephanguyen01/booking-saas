import { Button } from '@booking/ui/components/ui/button';
import { Clock3 } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';
import {
  AccountListState,
  AccountTypeTabs,
} from '~/features/account/components/shared/account-primitives';
import { useAccountTypeFilter } from '~/features/account/hooks/use-account-type-filter';
import type { loadAccountRecentRoute } from '~/features/account/server/account-recent-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

export function AccountRecentPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountRecentRoute>;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { listingTypes } = useOutletContext<AccountOutletContext>();
  const { isAllSelected, isTypeSelected, selectAll, selectType, visibleItems } =
    useAccountTypeFilter(loaderData.items, (item) => item.listing.listingTypeSlug);

  return (
    <div className="flex flex-col gap-4 py-2 font-studio">
      <h1 className="text-base font-semibold leading-6 text-foreground">{t('recent.title')}</h1>

      <div className="flex flex-col gap-3">
        <AccountTypeTabs
          label={t('recent.filterLabel')}
          tabs={[
            { key: 'all', label: t('recent.all'), active: isAllSelected, onSelect: selectAll },
            ...listingTypes.map((type) => ({
              key: type.id,
              label: type.name,
              active: isTypeSelected(type.slug),
              onSelect: () => selectType(type.slug),
            })),
          ]}
        />

        {visibleItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => (
              <FavoriteListingCard
                key={item.listing.id}
                listing={item.listing}
                presentation={item.presentation}
                className="min-h-[394px]"
              />
            ))}
          </div>
        ) : (
          <AccountListState
            icon={Clock3}
            message={t('recent.empty')}
            action={
              <Button asChild>
                <Link to={storefrontPaths.home(loaderData.locale)}>{t('recent.explore')}</Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
