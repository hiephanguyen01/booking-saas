import { Button } from '@booking/ui/components/ui/button';
import { Heart, MapPin, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  AccountPanel,
  DemoNotice,
  MockDisabledState,
  PageHeading,
  StudioThumbnail,
} from '../../features/account/components/account-primitives';
import { accountMocksEnabled, mockListings } from '../../features/account/server/mock-data.server';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import type { Route } from './+types/favorites';

export function loader({ params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const enabled = accountMocksEnabled();
  return { locale, enabled, items: enabled ? mockListings(locale).slice(0, 2) : [] };
}
export default function FavoritesPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(NsI18n.Account);
  const locale = loaderData.locale === 'en' ? 'en' : 'vi';
  const [removed, setRemoved] = useState<string[]>([]);
  const items = loaderData.items.filter((item) => !removed.includes(item.id));
  if (!loaderData.enabled)
    return (
      <div className="space-y-4">
        <PageHeading title={t('favorites.title')} />
        <MockDisabledState />
      </div>
    );
  return (
    <div className="space-y-4">
      <PageHeading title={t('favorites.title')} demo />
      <DemoNotice />
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <AccountPanel key={item.id} className="overflow-hidden">
              <StudioThumbnail label={item.title} className="h-44" />
              <div className="p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.studio}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoved((ids) => [...ids, item.id])}
                    className="flex size-9 items-center justify-center rounded-full text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Heart className="size-5" fill="currentColor" />
                  </button>
                </div>
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="size-4" />
                  {item.location}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-semibold text-primary">{item.price}</span>
                  <span className="flex items-center gap-1 text-xs">
                    <Star className="size-4 text-amber-500" fill="currentColor" />
                    {item.rating}
                  </span>
                </div>
              </div>
            </AccountPanel>
          ))}
        </div>
      ) : (
        <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-4 p-8">
          <p className="text-sm text-muted-foreground">{t('favorites.empty')}</p>
          <Button asChild>
            <Link to={storefrontPaths.home(locale)}>{t('favorites.explore')}</Link>
          </Button>
        </AccountPanel>
      )}
    </div>
  );
}
