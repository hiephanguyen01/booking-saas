import type { CustomerReviewItem } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { ReceiptText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigation } from 'react-router';
import { AccountResultsSkeleton } from '../../../components/loading-skeletons';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { isReadNavigationMethod, useMinimumPending } from '../../../lib/use-minimum-pending';
import type { Route } from '../../../routes/account/+types/bookings';
import { AccountPanel, PageHeading } from '../components/account-primitives';
import { BookingHistoryCard } from '../components/booking-history-card';
import { CancelBookingDialog } from '../components/cancel-booking-dialog';
import { ReviewDialog } from '../components/review-dialog';
import {
  BOOKING_HISTORY_FILTERS,
  parseBookingHistoryFilter,
  type AccountBookingViewModel,
} from '../lib/booking-history';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function AccountBookingsPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Common]);
  const locale = loaderData.locale === 'en' ? 'en' : 'vi';
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);
  const [activeCancellation, setActiveCancellation] = useState<AccountBookingViewModel | null>(
    null,
  );
  const location = useLocation();
  const navigation = useNavigation();
  const readNavigationActive =
    navigation.state === 'loading' &&
    navigation.location?.pathname === location.pathname &&
    isReadNavigationMethod(navigation.formMethod);
  const pending = useMinimumPending(readNavigationActive);
  const activeFilter = readNavigationActive
    ? parseBookingHistoryFilter(new URLSearchParams(navigation.location?.search).get('status'))
    : loaderData.filter;

  return (
    <div className="space-y-3">
      <PageHeading title={t('bookings.title')} />
      <BookingTabs active={activeFilter} locale={locale} />

      {pending ? (
        <AccountResultsSkeleton label={t('common:loading')} />
      ) : loaderData.error ? (
        <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-none p-8 text-center">
          <RefreshCw className="size-9 text-destructive" />
          <p className="text-sm text-destructive">{t('bookings.unavailable')}</p>
          <Button asChild variant="outline">
            <Link to={storefrontPaths.account.bookings(locale)}>{t('bookings.retry')}</Link>
          </Button>
        </AccountPanel>
      ) : loaderData.bookings.length === 0 ? (
        <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-none p-8 text-center">
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
        action={storefrontPaths.account.bookings(locale)}
        onOpenChange={(open) => !open && setActiveReview(null)}
      />
      {activeCancellation ? (
        <CancelBookingDialog
          booking={activeCancellation}
          locale={locale}
          open
          action={storefrontPaths.account.bookings(locale)}
          onOpenChange={(open) => !open && setActiveCancellation(null)}
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
      className="overflow-x-auto border-b border-border/70 bg-background shadow-[0_4px_16px_rgba(15,23,42,0.03)]"
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
