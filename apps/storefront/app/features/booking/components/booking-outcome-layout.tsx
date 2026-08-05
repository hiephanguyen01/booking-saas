import type { BookingStatus } from '@booking/contracts';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { SectionCard } from '~/components/section-card';
import { BookingStatusBadge } from '~/features/account/components/shared/booking-status-badge';
import { storefrontPaths } from '~/constants/paths';
import { formatVnd } from '~/lib/ui';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import { BookingListingSummary } from './booking-listing-summary';
import {
  BookingContactSection,
  BookingFinancialSection,
  PaymentTaxNote,
} from './booking-detail-sections';

/**
 * The shell every outcome of the payment flow renders inside — awaiting, failed
 * and succeeded.
 *
 * It deliberately reuses checkout's shell verbatim: the same `bg-muted` band,
 * the same 1218px container, the same two equal columns and the same card
 * rhythm. These screens are the step immediately after checkout, and a customer
 * moving between them should not feel the page change underneath them. Before
 * this the three outcomes each had their own width, heading scale and panel
 * treatment, and none of them matched the page they came from.
 *
 * Every panel here draws from the tenant's `--sf-surface-*` tokens — the ones
 * this layout owns through `SectionCard`, and the booking detail sections
 * through `PANEL_SURFACE` — so radius, border and shadow reach this page like
 * every other storefront surface.
 */
export function BookingOutcomeLayout({
  locale,
  title,
  description,
  icon,
  actions,
  children,
  code,
  bookingStatus,
  paidAmount,
  booking,
}: {
  locale: 'en' | 'vi';
  title: string;
  description: string;
  /** The status glyph; tone is the caller's, since only it knows the outcome. */
  icon: ReactNode;
  actions: ReactNode;
  /** Extra body between the message and the actions (retry forms, alerts). */
  children?: ReactNode;
  code: string;
  bookingStatus: BookingStatus | null;
  paidAmount?: string | null;
  /**
   * The booked service and its money, when the access grant let us load it.
   * Null degrades to the code/status summary alone rather than failing the page.
   */
  booking?: BookingDetailViewModel | null;
}) {
  const { t } = useTranslation(NsI18n.Booking);

  return (
    <div className="bg-muted py-4 font-studio sm:py-6 lg:py-8">
      <main className="mx-auto w-full max-w-304.5 px-4 sm:px-6">
        <h1 className="sr-only">{title}</h1>

        <Link
          to={storefrontPaths.bookings(locale)}
          className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('lookup.title')}
        </Link>

        {/* Checkout's two columns, in checkout's order: what was booked on the
            left, what to do about it on the right. The left column only exists
            when the detail loaded — otherwise the outcome centres in one column
            rather than sitting beside an empty half. */}
        <div
          className={`mt-2 grid items-start gap-4 *:min-w-0 ${booking ? 'lg:grid-cols-2' : 'mx-auto max-w-2xl'}`}
        >
          {booking ? (
            <div className="flex flex-col gap-4">
              <SectionCard aria-labelledby="booking-what-heading">
                <h2
                  id="booking-what-heading"
                  className="text-base leading-6 font-semibold text-foreground"
                >
                  {t('payment.bookedTitle')}
                </h2>
                <BookingListingSummary booking={booking} className="mt-4" />
              </SectionCard>

              {/* The same blocks, in the same order, as the signed-in detail
                  page. They frame themselves — each is already a panel — so they
                  are not wrapped again here. The review section is deliberately
                  absent: leaving a review needs an account, and a guest arrived
                  with an OTP. */}
              <BookingContactSection booking={booking} />
              <BookingFinancialSection booking={booking} locale={locale} settlement={null} />
              <PaymentTaxNote booking={booking} />
            </div>
          ) : null}

          {/* Stacked, the outcome comes first: it is the one thing this page
              exists to report, and below `lg` the booking detail is a long
              scroll to put in front of it. Side by side both are visible, so
              the columns return to reading order. */}
          <div className="flex flex-col gap-4 max-lg:order-first">
            <SectionCard aria-labelledby="booking-outcome-heading">
              <div className="flex items-start gap-4">
                {icon}
                <div className="min-w-0">
                  <h2
                    id="booking-outcome-heading"
                    className="text-base leading-6 font-semibold text-foreground"
                  >
                    {title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              </div>
              {children}
              <div className="mt-6">{actions}</div>
            </SectionCard>

            <SectionCard aria-labelledby="booking-summary-heading">
              <h2
                id="booking-summary-heading"
                className="text-base leading-6 font-semibold text-foreground"
              >
                {t('payment.summaryTitle')}
              </h2>

              <dl className="mt-4 flex flex-col gap-3">
                <SummaryRow label={t('code')}>
                  <span className="font-mono font-semibold break-all text-foreground">{code}</span>
                </SummaryRow>
                {bookingStatus ? (
                  <SummaryRow label={t('status')}>
                    <BookingStatusBadge status={bookingStatus} />
                  </SummaryRow>
                ) : null}
              </dl>

              {/* The tinted total block checkout uses for its price summary — the
                amount is what a customer scans for, so it gets the same
                treatment on both screens. */}
              {paidAmount && paidAmount !== '0' ? (
                <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-5 py-4">
                  <span className="text-sm leading-5 font-medium text-foreground">
                    {t('payment.paid')}
                  </span>
                  <strong className="text-base leading-6 font-semibold text-primary tabular-nums">
                    {formatVnd(paidAmount)}
                  </strong>
                </div>
              ) : null}

              <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {t('payment.webhookNote')}
              </p>
            </SectionCard>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm leading-5 font-medium text-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}
