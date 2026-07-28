import type { BookingStatus, PaymentStatusResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Spinner } from '@booking/ui/components/ui/spinner';
import {
  ArrowLeft,
  CircleCheckBig,
  CircleX,
  Clock3,
  Home,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/lib/locale-paths';
import { formatVnd } from '~/lib/ui';
import { BookingSuccessView } from './booking-success-view';

interface BookingPaymentViewProps {
  code: string;
  locale: 'en' | 'vi';
  status: PaymentStatusResponse;
  bookingStatus: BookingStatus | null;
  paymentFailed: boolean;
  isSuccess: boolean;
  isPending: boolean;
  canRetry: boolean;
  listingSlug: string | null;
  maskedEmail: string | null;
  mockEnabled: boolean;
  submitting: boolean;
  signedIn: boolean;
  actionError: string | null;
}

export function BookingPaymentView({
  code,
  locale,
  status,
  bookingStatus,
  paymentFailed,
  isSuccess,
  isPending,
  canRetry,
  listingSlug,
  maskedEmail,
  mockEnabled,
  submitting,
  signedIn,
  actionError,
}: BookingPaymentViewProps) {
  const { t } = useTranslation([NsI18n.Booking, NsI18n.Error]);

  if (isSuccess) {
    return (
      <BookingSuccessView
        code={code}
        locale={locale}
        maskedEmail={maskedEmail}
        signedIn={signedIn}
      />
    );
  }

  return (
    <div className="bg-muted/20 font-studio">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        <Link
          to={storefrontPaths.bookings(locale)}
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('lookup.title')}
        </Link>

        <header className="mt-6 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('payment.pageTitle')}
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            {t('payment.pageDescription')}
          </p>
        </header>

        <div className="mt-8 grid items-start gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
          <Card className="gap-0 rounded-sm border-border py-0 shadow-sm">
            <CardContent className="flex flex-col gap-6 p-5 sm:p-8">
              <div className="flex items-start gap-4">
                <StatusIcon success={isSuccess} pending={isPending} />
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-foreground">
                    {isSuccess
                      ? t('payment.succeeded')
                      : isPending
                        ? t('payment.title')
                        : t('payment.failedTitle')}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {isSuccess
                      ? t('payment.confirmedNote')
                      : isPending
                        ? t('payment.checking')
                        : t('payment.failedNote')}
                  </p>
                </div>
              </div>

              {actionError ? (
                <p
                  role="alert"
                  className="rounded-sm border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
                >
                  {actionError === 'PAYMENT_RETRY_UNAVAILABLE'
                    ? t('payment.retryUnavailable')
                    : t('payment.actionFailed')}
                </p>
              ) : null}

              {isPending ? (
                <PendingActions status={status} mockEnabled={mockEnabled} submitting={submitting} />
              ) : null}

              {paymentFailed && canRetry ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="retry-payment" />
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-sm text-base"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <RefreshCw data-icon="inline-start" />
                    )}
                    {submitting ? t('payment.redirecting') : t('payment.payNow')}
                  </Button>
                </Form>
              ) : null}

              {paymentFailed && !canRetry && listingSlug ? (
                <Button asChild className="h-12 w-full rounded-sm text-base">
                  <Link to={storefrontPaths.listing(locale, listingSlug)}>
                    <RefreshCw data-icon="inline-start" />
                    {t('chooseAnotherTime')}
                  </Link>
                </Button>
              ) : null}

              <Button asChild variant="outline" className="h-12 w-full rounded-sm text-base">
                <Link to={storefrontPaths.home(locale)}>
                  <Home data-icon="inline-start" />
                  {t('errors:home')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <aside className="rounded-sm border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="font-semibold text-foreground">{t('payment.summaryTitle')}</h2>
            <dl className="mt-5 divide-y divide-border rounded-sm border border-border px-4">
              <SummaryRow label={t('code')} value={code} mono />
              {bookingStatus ? (
                <SummaryRow label={t('status')} value={t(`statusLabels.${bookingStatus}`)} />
              ) : null}
              {status.paidAmount !== '0' ? (
                <SummaryRow label={t('payment.paid')} value={formatVnd(status.paidAmount)} />
              ) : null}
            </dl>
            <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              {t('payment.webhookNote')}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ success, pending }: { success: boolean; pending: boolean }) {
  if (success) {
    return (
      <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-emerald-500/10 text-emerald-600">
        <CircleCheckBig className="size-7" aria-hidden="true" />
      </span>
    );
  }
  if (pending) {
    return (
      <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary">
        <Clock3 className="size-6" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-destructive/10 text-destructive">
      <CircleX className="size-7" aria-hidden="true" />
    </span>
  );
}

function PendingActions({
  status,
  mockEnabled,
  submitting,
}: {
  status: PaymentStatusResponse;
  mockEnabled: boolean;
  submitting: boolean;
}) {
  const { t } = useTranslation(NsI18n.Booking);
  // Only offer the mock button while awaiting payment (not while awaiting partner approval).
  const awaitingPayment = status.bookingStatus === 'pending_payment';
  if (!mockEnabled || !awaitingPayment) {
    return <p className="text-center text-sm text-muted-foreground">{t('payment.checking')}</p>;
  }
  return (
    <Form method="post" className="flex flex-col gap-2">
      <input type="hidden" name="intent" value="mock-pay" />
      <Button type="submit" className="h-12 w-full rounded-sm text-base" disabled={submitting}>
        {submitting ? <Spinner data-icon="inline-start" /> : null}
        {submitting ? t('payment.processing') : t('payment.mockPay')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t('payment.mockHint')}</p>
    </Form>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm first:pt-3 last:pb-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? 'break-all text-right font-mono font-semibold text-foreground'
            : 'text-right font-medium text-foreground'
        }
      >
        {value}
      </dd>
    </div>
  );
}
