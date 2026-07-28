import { Button } from '@booking/ui/components/ui/button';
import { Clock3 } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import type { Route } from '../../../routes/account/+types/recent';
import type { AccountOutletContext } from '~/routes/account/layout';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';
import { AccountPanel } from '~/features/account/components/account-primitives';
import { useAccountRecentController } from './use-account-recent-controller';

export function AccountRecentPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(NsI18n.Account);
  const { listingTypes } = useOutletContext<AccountOutletContext>();
  const { isAllSelected, isTypeSelected, selectAll, selectType, visibleItems } =
    useAccountRecentController(loaderData.items);

  return (
    <div className="flex flex-col gap-4 py-2 font-studio">
      <h1 className="text-base font-semibold leading-6 text-foreground">{t('recent.title')}</h1>

      <div className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label={t('recent.filterLabel')}
          className="flex min-h-13 w-full overflow-x-auto bg-background shadow-[0_0_8px_rgba(0,0,0,0.04)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <RecentTab active={isAllSelected} label={t('recent.all')} onSelect={selectAll} />
          {listingTypes.map((type) => (
            <RecentTab
              key={type.id}
              active={isTypeSelected(type.slug)}
              label={type.name}
              onSelect={() => selectType(type.slug)}
            />
          ))}
        </div>

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
          <RecentEmptyState locale={loaderData.locale} />
        )}
      </div>
    </div>
  );
}

function RecentTab({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`relative shrink-0 px-6 py-4 text-sm font-semibold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
    </button>
  );
}

function RecentEmptyState({ locale }: { locale: 'vi' | 'en' }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Clock3 aria-hidden="true" className="size-6" />
      </span>
      <p className="text-sm text-muted-foreground">{t('recent.empty')}</p>
      <Button asChild>
        <Link to={storefrontPaths.home(locale)}>{t('recent.explore')}</Link>
      </Button>
    </AccountPanel>
  );
}
