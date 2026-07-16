import type {
  BookingResponse,
  BookingStatus,
  PaymentStatusResponse,
} from '@booking/contracts';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { CircleCheckBig, CircleX, Clock3, History, Home, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { data, Form, Link, redirect, useNavigation, useOutletContext, useRevalidator, useSearchParams } from 'react-router';
import {
  cancelBooking,
  checkoutBooking,
  fetchBookingByCode,
  fetchPaymentStatus,
  mockPay,
  mockPaymentsEnabled,
} from '../lib/booking.server';
import { getCheckoutFlowService } from '../lib/checkout-flow.server';
import { NsI18n, type ScopedI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import { formatVnd } from '../lib/ui';
import { useLocale } from '../lib/use-locale';
import type { Route } from './+types/booking-detail';
import type { StorefrontContext } from '../root';

export function meta() {
  return [{ title: 'Booking' }, { name: 'robots', content: 'noindex' }];
}

const PENDING = new Set<BookingStatus>(['pending_payment', 'pending_approval', 'draft']);
const SUCCESS = new Set<BookingStatus>(['confirmed', 'completed']);
type BookingT = ScopedI18n<NsI18n.Booking>['t'];
const BOOKING_STATUSES = [
  'draft',
  'pending_approval',
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'rejected',
  'expired',
  'refunded',
] as const satisfies readonly BookingStatus[];

function normalizeBookingStatus(value: string | null | undefined): BookingStatus {
  return BOOKING_STATUSES.includes(value as BookingStatus)
    ? (value as BookingStatus)
    : 'pending_payment';
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const otp = url.searchParams.get('otp') ?? undefined;
  const [status, flow] = await Promise.all([
    fetchPaymentStatus(request, params.code),
    getCheckoutFlowService().readForCode(request, params.code),
  ]);
  // Full details (schedule/amounts + cancel) are only accessible with the OTP
  // (or a logged-in session) — §8.6. Right after checkout we show status only.
  let booking: BookingResponse | null = null;
  try {
    booking = await fetchBookingByCode(request, params.code, otp);
  } catch {
    booking = null;
  }
  const payload = {
    code: params.code,
    status,
    booking,
    mockEnabled: mockPaymentsEnabled(),
    otp: otp ?? null,
    canRetry: Boolean(flow && status?.bookingStatus !== 'expired'),
    listingSlug: flow?.record.listingSlug ?? null,
  };
  if (status?.paymentStatus === 'succeeded' && flow) {
    return data(payload, {
      headers: { 'Set-Cookie': await getCheckoutFlowService().destroy(request) },
    });
  }
  return payload;
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'mock-pay') {
    const result = await mockPay(request, params.code);
    return data({ ok: result.ok, error: result.error ?? null });
  }
  if (intent === 'retry-payment') {
    const flow = await getCheckoutFlowService().readForCode(request, params.code);
    let bookingId = flow?.record.bookingId ?? null;
    if (!bookingId) {
      try {
        const owned = await fetchBookingByCode(
          request,
          params.code,
          String(form.get('otp') ?? '') || undefined,
        );
        bookingId = owned?.id ?? null;
      } catch {
        bookingId = null;
      }
    }
    if (!bookingId) {
      return data({ ok: false, error: 'PAYMENT_RETRY_UNAVAILABLE' }, { status: 403 });
    }
    const checkout = await checkoutBooking(request, bookingId);
    if (checkout.ok && checkout.data && /^https?:/i.test(checkout.data.paymentUrl)) {
      return redirect(checkout.data.paymentUrl);
    }
    return data(
      { ok: false, error: checkout.error ?? checkout.code ?? 'PAYMENT_RETRY_FAILED' },
      { status: checkout.status || 400 },
    );
  }
  if (intent === 'cancel') {
    const otp = String(form.get('otp') ?? '') || undefined;
    const reason = String(form.get('reason') ?? '').trim() || undefined;
    const result = await cancelBooking(request, params.code, { reason, otp });
    return data({ ok: result.ok, error: result.error ?? null });
  }
  return data({ ok: false, error: 'UNKNOWN_INTENT' });
}

export default function BookingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { code, status, booking, mockEnabled, canRetry, listingSlug } = loaderData;
  const { t } = useTranslation(NsI18n.Booking);
  const { currentUser } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const [sp] = useSearchParams();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  const bookingStatus = normalizeBookingStatus(status?.bookingStatus ?? booking?.status);
  const paymentFailed =
    sp.get('cancelled') === '1' ||
    status?.paymentStatus === 'failed' ||
    status?.paymentStatus === 'expired' ||
    bookingStatus === 'expired' ||
    bookingStatus === 'rejected';
  const isSuccess = !paymentFailed && (status?.paymentStatus === 'succeeded' || SUCCESS.has(bookingStatus));
  const isPending = !paymentFailed && !isSuccess && PENDING.has(bookingStatus);

  // Poll while pending (the webhook — not the return URL — confirms payment, §11.2).
  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => {
      if (revalidator.state === 'idle') revalidator.revalidate();
    }, 3000);
    return () => clearInterval(id);
  }, [isPending, revalidator]);

  return (
    <main className="grid min-h-[600px] place-items-center bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
      <Card className="w-full max-w-107.5 gap-0 rounded-sm py-0 shadow-[0_12px_40px_rgba(15,23,42,0.10)]">
        <CardHeader className="items-center px-6 pt-10 pb-5 text-center sm:px-10">
          <StatusIcon success={isSuccess} pending={isPending} />
          <CardTitle className="mt-4 text-xl">
            {isSuccess
              ? locale === 'vi'
                ? 'Đặt thành công'
                : 'Booking successful'
              : isPending
                ? t('payment.title')
                : locale === 'vi'
                  ? 'Không thành công'
                  : 'Payment unsuccessful'}
          </CardTitle>
          <CardDescription className="max-w-sm leading-6">
            {isSuccess
              ? t('payment.confirmedNote')
              : isPending
                ? t('payment.checking')
                : locale === 'vi'
                  ? 'Thanh toán chưa hoàn tất. Bạn có thể thử lại hoặc liên hệ hỗ trợ.'
                  : 'Payment was not completed. You can try again or contact support.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 px-6 pb-8 sm:px-10 sm:pb-10">
          <div className="rounded-sm bg-muted/55 p-4 text-sm">
            <Row label={t('code')} value={code} mono />
            <div className="mt-2">
              <Row label={t('status')} value={t(`statusLabels.${bookingStatus}`)} />
            </div>
            {status && status.paidAmount !== '0' ? (
              <div className="mt-2">
                <Row label={t('payment.paid')} value={formatVnd(status.paidAmount)} />
              </div>
            ) : null}
          </div>

          {actionData && !actionData.ok && actionData.error ? (
            <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {retryError(actionData.error, locale)}
            </p>
          ) : null}

          {isPending ? <PendingActions status={status} mockEnabled={mockEnabled} t={t} /> : null}

          {paymentFailed && canRetry ? (
            <Form method="post">
              <input type="hidden" name="intent" value="retry-payment" />
              {sp.get('otp') ? <input type="hidden" name="otp" value={sp.get('otp') ?? ''} /> : null}
              <Button type="submit" className="h-12 w-full rounded-sm text-base" disabled={submitting}>
                {submitting ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                {submitting
                  ? locale === 'vi'
                    ? 'Đang chuyển…'
                    : 'Redirecting…'
                  : locale === 'vi'
                    ? 'Thanh toán ngay'
                    : 'Pay now'}
              </Button>
            </Form>
          ) : null}

          {isSuccess && currentUser ? (
            <Button asChild className="h-12 w-full rounded-sm text-base">
              <Link to={storefrontPaths.bookings(locale)}>
                <History data-icon="inline-start" />
                {locale === 'vi' ? 'Lịch sử đặt đơn' : 'Booking history'}
              </Link>
            </Button>
          ) : null}

          {paymentFailed && !canRetry && listingSlug ? (
            <Button asChild className="h-12 w-full rounded-sm text-base">
              <Link to={storefrontPaths.listing(locale, listingSlug)}>
                <RefreshCw data-icon="inline-start" />
                {locale === 'vi' ? 'Chọn giờ khác' : 'Choose another time'}
              </Link>
            </Button>
          ) : null}

          <Button asChild variant="outline" className="h-12 w-full rounded-sm text-base">
            <Link to={storefrontPaths.home(locale)}>
              <Home data-icon="inline-start" />
              {locale === 'vi' ? 'Trang chủ' : 'Home'}
            </Link>
          </Button>
          <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {locale === 'vi'
              ? 'Webhook của cổng thanh toán là nguồn xác nhận cuối cùng.'
              : 'The payment gateway webhook is the final source of confirmation.'}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return (
    <RouteErrorState
      error={error}
      homeHref={storefrontPaths.bookings(locale)}
      homeLabel="Tra cứu đặt chỗ"
    />
  );
}

function StatusIcon({ success, pending }: { success: boolean; pending: boolean }) {
  if (success) {
    return (
      <span className="grid size-15 place-items-center rounded-full bg-emerald-50 text-emerald-500">
        <CircleCheckBig className="size-9" aria-hidden="true" />
      </span>
    );
  }
  if (pending) {
    return (
      <span className="grid size-15 place-items-center rounded-full bg-primary/10 text-primary">
        <Clock3 className="size-8" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="grid size-15 place-items-center rounded-full bg-destructive/10 text-destructive">
      <CircleX className="size-9" aria-hidden="true" />
    </span>
  );
}

function PendingActions({
  status,
  mockEnabled,
  t,
}: {
  status: PaymentStatusResponse | null;
  mockEnabled: boolean;
  t: BookingT;
}) {
  // Only offer the mock button while awaiting payment (not while awaiting partner approval).
  const awaitingPayment = status?.bookingStatus === 'pending_payment';
  if (!mockEnabled || !awaitingPayment) {
    return (
      <p className="text-center text-sm text-muted-foreground">{t('payment.checking')}</p>
    );
  }
  return (
    <Form method="post" className="flex flex-col gap-2">
      <input type="hidden" name="intent" value="mock-pay" />
      <Button type="submit" className="h-11 w-full">
        {t('payment.mockPay')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t('payment.mockHint')}</p>
    </Form>
  );
}

function retryError(error: string, locale: 'vi' | 'en'): string {
  if (error === 'PAYMENT_RETRY_UNAVAILABLE') {
    return locale === 'vi'
      ? 'Phiên thanh toán đã hết hạn. Vui lòng chọn lại lịch.'
      : 'The payment session has expired. Please choose the schedule again.';
  }
  return error;
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono font-semibold' : 'font-medium text-foreground'}>
        {value}
      </span>
    </div>
  );
}
