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
 * The outcome and its actions lead in a full-width hero. The booking content
 * then uses an asymmetric detail/sidebar grid: the long listing specification
 * gets the wider reading column while the concise money and status summary stays
 * visible beside it. On small screens the summary moves ahead of the long detail
 * so the information customers need to verify remains close to the outcome.
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
    <div className="min-h-full bg-muted/50 py-4 font-studio sm:py-6 lg:py-8">
      <main className="mx-auto w-full max-w-304.5 px-4 sm:px-6">
        <Link
          to={storefrontPaths.bookings(locale)}
          className="inline-flex min-h-10 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('lookup.title')}
        </Link>

        <SectionCard aria-labelledby="booking-outcome-heading" className="mt-3 overflow-hidden">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              {icon}
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold tracking-wide text-primary uppercase">
                  {t('code')} · {code}
                </p>
                <h1
                  id="booking-outcome-heading"
                  className="mt-1 text-xl leading-tight font-semibold tracking-tight text-foreground sm:text-2xl"
                >
                  {title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
            {bookingStatus ? (
              <div className="shrink-0 self-start">
                <BookingStatusBadge status={bookingStatus} />
              </div>
            ) : null}
          </div>

          {children}

          <div className="mt-6 border-t border-border pt-5">{actions}</div>
        </SectionCard>

        <div
          className={`mt-4 grid items-start gap-4 *:min-w-0 ${
            booking ? 'lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]' : 'mx-auto max-w-2xl'
          }`}
        >
          {booking ? (
            <div className="flex flex-col gap-4">
              <SectionCard aria-labelledby="booking-what-heading">
                <h2
                  id="booking-what-heading"
                  className="text-lg leading-6 font-semibold tracking-tight text-foreground"
                >
                  {t('payment.bookedTitle')}
                </h2>
                <BookingListingSummary booking={booking} className="mt-5" />
              </SectionCard>

              <BookingContactSection booking={booking} />
            </div>
          ) : null}

          <aside className="flex flex-col gap-4 max-lg:order-first lg:sticky lg:top-24">
            <SectionCard aria-labelledby="booking-summary-heading">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="booking-summary-heading"
                    className="text-lg leading-6 font-semibold tracking-tight text-foreground"
                  >
                    {t('payment.summaryTitle')}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">{t('code')}</p>
                </div>
                <span className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs font-semibold break-all text-foreground">
                  {code}
                </span>
              </div>

              <dl className="mt-5 flex flex-col gap-3">
                {bookingStatus ? (
                  <SummaryRow label={t('status')}>
                    <BookingStatusBadge status={bookingStatus} />
                  </SummaryRow>
                ) : null}
              </dl>

              {paidAmount && paidAmount !== '0' ? (
                <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-primary/5 px-4 py-4">
                  <span className="text-sm leading-5 font-medium text-foreground">
                    {t('payment.paid')}
                  </span>
                  <strong className="text-lg leading-6 font-semibold text-primary tabular-nums">
                    {formatVnd(paidAmount)}
                  </strong>
                </div>
              ) : null}

              <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {t('payment.webhookNote')}
              </p>
            </SectionCard>

            {booking ? (
              <>
                <BookingFinancialSection booking={booking} locale={locale} settlement={null} />
                <PaymentTaxNote booking={booking} />
              </>
            ) : null}
          </aside>
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
