import type {
  BookingStatus,
  ManualRefundStatusResponse,
  PaymentStatusResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { CircleX, Clock3, Home, RefreshCw } from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';
import { BookingOutcomeLayout } from './booking-outcome-layout';
import { BookingSuccessView } from './booking-success-view';
import {
  ManualRefundCustomerPanel,
  type CustomerRefundActionData,
} from './manual-refund-customer-panel';

interface BookingPaymentViewProps {
  code: string;
  locale: 'en' | 'vi';
  status: PaymentStatusResponse;
  bookingStatus: BookingStatus | null;
  isBalancePayment: boolean;
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
  booking: BookingDetailViewModel | null;
  recommendations: DiscoveryListingCardData[];
  showDetail: boolean;
  manualRefunds: ManualRefundStatusResponse[];
  manualRefundAction?: CustomerRefundActionData;
}

export function BookingPaymentView({
  code,
  locale,
  status,
  bookingStatus,
  isBalancePayment,
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
  booking,
  recommendations,
  showDetail,
  manualRefunds,
  manualRefundAction,
}: BookingPaymentViewProps) {
  const { t } = useTranslation([NsI18n.Booking, NsI18n.Error]);

  if (isSuccess) {
    return (
      <>
        <BookingSuccessView
          code={code}
          locale={locale}
          maskedEmail={maskedEmail}
          signedIn={signedIn}
          bookingStatus={bookingStatus}
          paidAmount={status.paidAmount}
          booking={booking}
          recommendations={recommendations}
          showDetail={showDetail}
          submitting={submitting}
          isBalancePayment={isBalancePayment}
        />
        <ManualRefundCustomerPanel
          refunds={manualRefunds}
          locale={locale}
          actionData={manualRefundAction}
        />
      </>
    );
  }

  // Only offer the mock button while awaiting payment (not partner approval).
  const showMockPay = isPending && mockEnabled && status.bookingStatus === 'pending_payment';
  const retryLabel = submitting ? t('payment.redirecting') : t('payment.payNow');
  const title = isBalancePayment
    ? isPending
      ? t('payment.balanceTitle')
      : t('payment.balanceFailedTitle')
    : isPending
      ? t('payment.title')
      : t('payment.failedTitle');
  const description = isBalancePayment
    ? isPending
      ? t('payment.balanceChecking')
      : t('payment.balanceFailedNote')
    : isPending
      ? t('payment.checking')
      : t('payment.failedNote');

  return (
    <BookingOutcomeLayout
      locale={locale}
      title={title}
      description={description}
      code={code}
      bookingStatus={bookingStatus}
      paidAmount={status.paidAmount}
      booking={booking}
      icon={<StatusIcon pending={isPending} />}
      actions={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button asChild size="control" variant="outline" className="w-full sm:w-auto">
            <Link to={storefrontPaths.home(locale)}>
              <Home data-icon="inline-start" />
              {t('errors:home')}
            </Link>
          </Button>

          {showMockPay ? (
            <Form method="post" className="w-full sm:w-auto lg:w-70">
              <input type="hidden" name="intent" value="mock-pay" />
              <Button
                type="submit"
                size="control"
                className="w-full text-base font-semibold"
                disabled={submitting}
              >
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {submitting ? t('payment.processing') : t('payment.mockPay')}
              </Button>
            </Form>
          ) : null}

          {paymentFailed && canRetry ? (
            <Form method="post" className="w-full sm:w-auto lg:w-70">
              <input type="hidden" name="intent" value="retry-payment" />
              <Button
                type="submit"
                size="control"
                className="w-full text-base font-semibold"
                disabled={submitting}
              >
                {submitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}
                {retryLabel}
              </Button>
            </Form>
          ) : null}

          {paymentFailed && !canRetry && listingSlug ? (
            <Button
              asChild
              size="control"
              className="w-full text-base font-semibold sm:w-auto lg:w-70"
            >
              <Link to={storefrontPaths.listing(locale, listingSlug)}>
                <RefreshCw data-icon="inline-start" />
                {t('chooseAnotherTime')}
              </Link>
            </Button>
          ) : null}
        </div>
      }
    >
      {actionError ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-5 py-4 text-sm leading-6 text-destructive"
        >
          {actionError === 'PAYMENT_RETRY_UNAVAILABLE'
            ? t('payment.retryUnavailable')
            : t('payment.actionFailed')}
        </p>
      ) : null}

      {showMockPay ? (
        <p className="mt-4 rounded-lg bg-muted/40 px-5 py-4 text-sm leading-6 text-muted-foreground">
          {t('payment.mockHint')}
        </p>
      ) : null}
    </BookingOutcomeLayout>
  );
}

function StatusIcon({ pending }: { pending: boolean }) {
  const tone = pending
    ? 'bg-warning/10 text-warning ring-warning/20'
    : 'bg-destructive/10 text-destructive ring-destructive/20';
  const Icon = pending ? Clock3 : CircleX;
  return (
    <span
      className={`grid size-11 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${tone}`}
    >
      <Icon className="size-6" aria-hidden="true" />
    </span>
  );
}
