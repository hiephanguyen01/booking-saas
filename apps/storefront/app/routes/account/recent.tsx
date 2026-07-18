import { Button } from '@booking/ui/components/ui/button';
import { Clock3, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import {
  AccountPanel,
  DemoNotice,
  MockDisabledState,
  PageHeading,
  StudioThumbnail,
} from '../../features/account/components/account-primitives';
import { accountMocksEnabled, mockListings } from '../../features/account/server/mock-data.server';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { Route } from './+types/recent';

export function loader({ params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const enabled = accountMocksEnabled();
  return { enabled, items: enabled ? mockListings(locale) : [] };
}
export default function RecentPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(NsI18n.Account);
  const [hidden, setHidden] = useState<string[]>([]);
  const items = loaderData.items.filter((item) => !hidden.includes(item.id));
  if (!loaderData.enabled)
    return (
      <div className="space-y-4">
        <PageHeading title={t('recent.title')} />
        <MockDisabledState />
      </div>
    );
  return (
    <div className="space-y-4">
      <PageHeading title={t('recent.title')} demo />
      <DemoNotice />
      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <AccountPanel key={item.id} className="grid overflow-hidden sm:grid-cols-[180px_1fr]">
              <StudioThumbnail label={item.title} className="h-36 sm:h-full" />
              <div className="relative p-5 pr-14">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setHidden((ids) => [...ids, item.id])}
                  className="absolute right-3 top-3"
                  aria-label={t('recent.remove')}
                >
                  <X className="size-4" />
                </Button>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.studio}</p>
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="size-4" />
                  {item.location}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="size-4" />
                  {t('recent.hoursAgo', { count: index + 1 })}
                </p>
                <p className="mt-4 font-semibold text-primary">{item.price}</p>
              </div>
            </AccountPanel>
          ))}
        </div>
      ) : (
        <AccountPanel className="flex min-h-72 items-center justify-center p-8 text-sm text-muted-foreground">
          {t('recent.empty')}
        </AccountPanel>
      )}
    </div>
  );
}
