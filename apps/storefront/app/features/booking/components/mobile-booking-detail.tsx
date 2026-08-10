import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import type { ReactNode } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Building2, Hash } from 'lucide-react';
import { Link } from 'react-router';
import { MobileFlowHeader } from '~/features/site-shell/components/mobile-flow-header';
import { BookingStatusBadge } from '~/features/account/components/shared/booking-status-badge';
import { CancellationPolicyList } from '~/features/account/components/shared/account-primitives';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import { BookingListingSummary } from './booking-listing-summary';
import {
  BookingContactSection,
  BookingFinancialSection,
  PaymentTaxNote,
} from './booking-detail-sections';
import { storefrontPaths } from '~/constants/paths';

export function MobileBookingDetail({
  booking,
  locale,
  backHref,
  chatHref,
  settlement = null,
  actionBar,
  extraSections,
  actionError,
}: {
  booking: BookingDetailViewModel;
  locale: Locale;
  backHref: string;
  chatHref?: string;
  settlement?: CustomerBookingSettlementResponse | null;
  actionBar?: ReactNode;
  extraSections?: ReactNode;
  actionError?: ReactNode;
}) {
  const { t } = useTranslation([NsI18n.Booking, NsI18n.Account]);

  return (
    <div className="min-h-dvh bg-muted/45 pb-28 font-studio md:hidden">
      <MobileFlowHeader
        title={t('booking:viewDetails')}
        backHref={backHref}
        backLabel={t('booking:mobile.back')}
        chatHref={chatHref}
        chatLabel={t('account:bookings.chat')}
      />

      <main className="mx-auto w-full max-w-lg space-y-3 px-3 py-3">
        <section className="overflow-hidden rounded-(--sf-surface-radius) border border-border bg-card shadow-(--sf-surface-shadow)">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
            <div className="min-w-0">
              <Link
                to={storefrontPaths.listing(locale, booking.listingSlug)}
                className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{booking.partnerName}</span>
              </Link>
              <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground uppercase">
                <Hash className="size-3" aria-hidden="true" />
                {booking.code}
              </p>
            </div>
            <BookingStatusBadge status={booking.status} className="mt-2 shrink-0" />
          </div>
          <BookingListingSummary booking={booking} className="px-4 py-4" />
        </section>

        {actionError ? (
          <div
            role="alert"
            className="rounded-(--sf-surface-radius) border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {actionError}
          </div>
        ) : null}

        {booking.cancellationTiers.length ? (
          <section className="rounded-(--sf-surface-radius) border border-border bg-card px-4 py-4 shadow-(--sf-surface-shadow)">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {t('booking:mobile.cancellationPolicy')}
            </h2>
            <CancellationPolicyList booking={booking} locale={locale} />
          </section>
        ) : null}

        <BookingContactSection booking={booking} />
        <BookingFinancialSection booking={booking} locale={locale} settlement={settlement} />
        {extraSections}
        <PaymentTaxNote booking={booking} />
      </main>

      {actionBar}
    </div>
  );
}
