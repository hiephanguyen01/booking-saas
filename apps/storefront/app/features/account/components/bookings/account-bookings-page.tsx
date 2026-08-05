import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { ReceiptText, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { AccountResultsSkeleton } from '~/components/loading-skeletons';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { PANEL_SURFACE } from '~/constants/surfaces';
import {
  AccountPanel,
  PageHeading,
} from '~/features/account/components/shared/account-primitives';
import { BookingHistoryCard } from '~/features/account/components/bookings/booking-history-card';
import { CancelBookingDialog } from '~/features/account/components/bookings/cancel-booking-dialog';
import { ReviewDialog } from '~/features/account/components/reviews/review-dialog';
import { BOOKING_HISTORY_FILTERS } from '~/features/account/lib/booking-history';
import { useAccountBookingsPageController } from '~/features/account/hooks/use-account-bookings-page-controller';
import type { loadAccountBookingsRoute } from '~/features/account/server/account-bookings-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

export function AccountBookingsPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountBookingsRoute>;
}) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Common]);
  const {
    action,
    activeCancellation,
    activeFilter,
    activeReview,
    handleCancellationOpenChange,
    handleReviewOpenChange,
    locale,
    pending,
    setActiveCancellation,
    setActiveReview,
  } = useAccountBookingsPageController({
    locale: loaderData.locale,
    filter: loaderData.filter,
  });

  return (
    <div className="space-y-3">
      <PageHeading title={t('bookings.title')} />
      <BookingTabs active={activeFilter} locale={locale} />

      {pending ? (
        <AccountResultsSkeleton label={t('common:loading')} />
      ) : loaderData.error ? (
        <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
          <RefreshCw className="size-9 text-destructive" />
          <p className="text-sm text-destructive">{t('bookings.unavailable')}</p>
          <Button asChild variant="outline">
            <Link to={action}>{t('bookings.retry')}</Link>
          </Button>
        </AccountPanel>
      ) : loaderData.bookings.length === 0 ? (
        <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
          <ReceiptText className="size-9 text-primary" />
          <p className="text-sm text-muted-foreground">{t('bookings.emptyFilter')}</p>
        </AccountPanel>
      ) : (
        <div className="space-y-3 [content-visibility:auto]">
          {loaderData.bookings.map((booking) => (
            <BookingHistoryCard
              key={booking.id}
              booking={booking}
              locale={locale}
              onReview={setActiveReview}
              onCancel={setActiveCancellation}
            />
          ))}
        </div>
      )}

      <ReviewDialog
        review={activeReview}
        open={activeReview !== null}
        action={action}
        onOpenChange={handleReviewOpenChange}
      />
      {activeCancellation ? (
        <CancelBookingDialog
          booking={activeCancellation}
          locale={locale}
          open
          action={action}
          onOpenChange={handleCancellationOpenChange}
        />
      ) : null}
    </div>
  );
}

function BookingTabs({
  active,
  locale,
}: {
  active: (typeof BOOKING_HISTORY_FILTERS)[number];
  locale: 'vi' | 'en';
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <nav
      aria-label={t('bookings.filters.label')}
      className={cn(PANEL_SURFACE, 'overflow-x-auto')}
    >
      <div className="flex min-w-max">
        {BOOKING_HISTORY_FILTERS.map((filter) => {
          const href =
            filter === 'all'
              ? storefrontPaths.account.bookings(locale)
              : `${storefrontPaths.account.bookings(locale)}?status=${filter}`;
          return (
            <Link
              key={filter}
              to={href}
              prefetch="intent"
              aria-current={active === filter ? 'page' : undefined}
              className={`relative flex h-12 items-center px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 ${
                active === filter
                  ? 'text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`bookings.filters.${filter}`)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
