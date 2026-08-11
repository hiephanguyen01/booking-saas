import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays, MessageCircle } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';
import {
  AccountPanel,
  FeatureUnavailableState,
  PageHeading,
} from '~/features/account/components/shared/account-primitives';

export function AccountMessagesPage() {
  const { t } = useTranslation(NsI18n.Account);
  const { locale } = useOutletContext<AccountOutletContext>();

  return (
    <>
      <div className="-mx-4 -mt-4 bg-muted/35 pb-5 sm:-mx-6 md:hidden">
        <main className="px-3 pt-(--sf-section-gap)">
          <AccountPanel className="flex min-h-72 flex-col items-center justify-center p-(--sf-surface-pad) text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
              <MessageCircle className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-base font-bold text-foreground">
              {t('messages.mobile.unavailableTitle')}
            </h2>
            <p className="mt-2 max-w-72 text-sm leading-6 text-muted-foreground">
              {t('messages.mobile.unavailableDescription')}
            </p>
            <Button asChild className="mt-6 min-h-11 px-5">
              <Link to={storefrontPaths.account.bookings(locale)} prefetch="intent">
                <CalendarDays className="size-4" aria-hidden="true" />
                {t('messages.mobile.viewBookings')}
              </Link>
            </Button>
          </AccountPanel>
        </main>
      </div>

      <div className="hidden space-y-4 md:block">
        <PageHeading title={t('messages.title')} />
        <FeatureUnavailableState />
      </div>
    </>
  );
}
