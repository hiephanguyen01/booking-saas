import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { ReceiptText, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router';
import { Input } from '@booking/ui/components/ui/input';
import { AccountResultsSkeleton } from '~/components/loading-skeletons';
import { formatDateTime, NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { DEFAULT_TZ } from '~/lib/time';
import { AccountPanel, PageHeading } from '~/features/account/components/shared/account-primitives';
import { BookingHistoryCard } from '~/features/account/components/bookings/booking-history-card';
import { CancelBookingDialog } from '~/features/account/components/bookings/cancel-booking-dialog';
import { DisputeBookingDialog } from '~/features/account/components/bookings/dispute-booking-dialog';
import { ReviewDialog } from '~/features/account/components/reviews/review-dialog';
import {
  BOOKING_HISTORY_FILTERS,
  type BookingHistoryCounts,
} from '~/features/account/lib/booking-history';
import { useAccountBookingsPageController } from '~/features/account/hooks/use-account-bookings-page-controller';
import type { loadAccountBookingsRoute } from '~/features/account/server/account-bookings-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { MobileFlowHeader } from '~/features/site-shell/components/mobile-flow-header';
import { MobileBookingHistoryCard } from './mobile-booking-history-card';

export function AccountBookingsPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountBookingsRoute>;
}) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Common]);
  const {
    action,
    activeCancellation,
    activeDispute,
    activeFilter,
    activeReview,
    disputeAction,
    handleCancellationOpenChange,
    handleDisputeOpenChange,
    handleReviewOpenChange,
    locale,
    pending,
    query,
    setQuery,
    setActiveCancellation,
    setActiveDispute,
    setActiveReview,
    visibleBookings,
  } = useAccountBookingsPageController({
    locale: loaderData.locale,
    filter: loaderData.filter,
    bookings: loaderData.bookings,
  });
  const activeDisputeUntil = activeDispute
    ? (loaderData.disputeStates[activeDispute.id]?.disputeUntil ?? null)
    : null;

  return (
    <>
      <div className="-mx-4 -mt-4 bg-muted/35 pb-5 sm:-mx-6 md:hidden">
        <MobileFlowHeader title={t('bookings.title')} backLabel={t('bookings.mobile.back')} />
        <div className="border-b border-white/10 bg-[#131a2a] px-4 pb-4">
          <label className="relative block">
            <span className="sr-only">{t('bookings.mobile.searchLabel')}</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t('bookings.mobile.searchPlaceholder')}
              className="h-11 border-white/15 bg-white text-foreground pl-10"
            />
          </label>
        </div>
        <BookingTabs active={activeFilter} locale={locale} counts={loaderData.counts} mobile />

        <div className="space-y-3 px-3 pt-3">
          {pending ? (
            <AccountResultsSkeleton label={t('common:loading')} />
          ) : loaderData.error ? (
            <AccountPanel className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
              <RefreshCw className="size-9 text-destructive" />
              <p className="text-sm text-destructive">{t('bookings.unavailable')}</p>
              <Button asChild variant="outline">
                <Link to={action}>{t('bookings.retry')}</Link>
              </Button>
            </AccountPanel>
          ) : loaderData.bookings.length === 0 ? (
            <AccountPanel className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
              <ReceiptText className="size-9 text-primary" />
              <p className="text-sm text-muted-foreground">{t('bookings.emptyFilter')}</p>
            </AccountPanel>
          ) : visibleBookings.length === 0 ? (
            <AccountPanel className="flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center">
              <Search className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('bookings.mobile.searchEmpty')}</p>
            </AccountPanel>
          ) : (
            visibleBookings.map((booking) => (
              <MobileBookingHistoryCard
                key={booking.id}
                booking={booking}
                locale={locale}
                canDispute={loaderData.disputeStates[booking.id]?.canOpenDispute ?? false}
                onReview={setActiveReview}
                onCancel={setActiveCancellation}
                onDispute={setActiveDispute}
              />
            ))
          )}
        </div>
      </div>

      <div className="hidden space-y-3 md:block">
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
                canDispute={loaderData.disputeStates[booking.id]?.canOpenDispute ?? false}
                onReview={setActiveReview}
                onCancel={setActiveCancellation}
                onDispute={setActiveDispute}
              />
            ))}
          </div>
        )}
      </div>

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
      {activeDispute ? (
        <DisputeBookingDialog
          deadlineLabel={
            activeDisputeUntil ? formatDateTime(activeDisputeUntil, locale, DEFAULT_TZ) : null
          }
          open
          action={disputeAction}
          onOpenChange={handleDisputeOpenChange}
        />
      ) : null}
    </>
  );
}

function BookingTabs({
  active,
  locale,
  counts,
  mobile = false,
}: {
  active: (typeof BOOKING_HISTORY_FILTERS)[number];
  locale: 'vi' | 'en';
  counts?: BookingHistoryCounts;
  mobile?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <nav
      aria-label={t('bookings.filters.label')}
      className={cn(
        PANEL_SURFACE,
        'overflow-x-auto',
        mobile && 'rounded-none border-x-0 shadow-none',
      )}
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
              <span>{t(`bookings.filters.${filter}`)}</span>
              {counts ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active === filter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  {counts[filter]}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
