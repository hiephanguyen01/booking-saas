import type { CustomerReviewItem } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { ReceiptText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AccountPanel, PageHeading } from '../../features/account/components/account-primitives';
import { BookingHistoryCard } from '../../features/account/components/booking-history-card';
import { ReviewDialog } from '../../features/account/components/review-dialog';
import {
  BOOKING_HISTORY_FILTERS,
  parseBookingHistoryFilter,
} from '../../features/account/lib/booking-history';
import { loadAccountBookings } from '../../features/account/server/booking-history.server';
import { submitCustomerReview } from '../../features/account/server/customer-reviews.server';
import { requireAuth } from '../../lib/auth.server';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import type { Route } from './+types/bookings';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const filter = parseBookingHistoryFilter(url.searchParams.get('status'));
  const result = await loadAccountBookings(request, auth.session.accessToken, locale, filter);
  return { locale, filter, ...result };
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return submitCustomerReview(request, locale);
}

export default function AccountBookingsPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(NsI18n.Account);
  const locale = loaderData.locale === 'en' ? 'en' : 'vi';
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);

  return (
    <div className="space-y-3">
      <PageHeading title={t('bookings.title')} />
      <BookingTabs active={loaderData.filter} locale={locale} />

      {loaderData.error ? (
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
