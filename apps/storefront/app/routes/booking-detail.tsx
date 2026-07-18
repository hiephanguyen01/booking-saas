import {
  bookingStatusSchema,
  type BookingStatus,
  type PaymentStatusResponse,
} from '@booking/contracts';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Spinner } from '@booking/ui/components/ui/spinner';
import {
  ArrowLeft,
  CircleCheckBig,
  CircleX,
  Clock3,
  History,
  Home,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect } from 'react';
import {
  data,
  Form,
  Link,
  redirect,
  useNavigation,
  useOutletContext,
  useRevalidator,
  useSearchParams,
} from 'react-router';
import {
  cancelBooking,
  checkoutBooking,
  fetchBookingByCode,
  fetchPaymentStatus,
  mockPay,
  mockPaymentsEnabled,
} from '../lib/booking.server';
import { getCheckoutFlowService } from '../lib/checkout-flow.server';
import { errorStatus } from '../lib/http-status';
import { NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import {
  allowedPaymentFormPost,
  allowedPaymentRedirect,
  isMockPaymentRedirect,
} from '../lib/payment-redirect.server';
import { formatVnd } from '../lib/ui';
import { useLocale } from '../lib/use-locale';
import type { StorefrontContext } from '../root';
import { PaymentHandoff } from '../features/checkout/components/payment-handoff';
import type { Route } from './+types/booking-detail';

export function meta() {
  return [{ title: 'Booking' }, { name: 'robots', content: 'noindex' }];
}

const PENDING = new Set<BookingStatus>(['pending_payment', 'pending_approval', 'draft']);
const SUCCESS = new Set<BookingStatus>(['confirmed', 'completed']);

/** `PaymentStatusResponse.bookingStatus` is wire-typed as a plain string (§11.2). */
function normalizeBookingStatus(value: string): BookingStatus | null {
  const parsed = bookingStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [status, flow] = await Promise.all([
    fetchPaymentStatus(request, params.code),
    getCheckoutFlowService().readForCode(request, params.code),
  ]);
  // `payment-status` is public and only 404s when no booking with this code
  // exists for the tenant — an unknown code is a real not-found, never a
  // payment still in flight.
  if (!status) throw new Response('Booking not found', { status: 404 });

  const payload = {
    code: params.code,
    status,
    mockEnabled: mockPaymentsEnabled(),
    canRetry: Boolean(flow && status.bookingStatus !== 'expired'),
    listingSlug: flow?.record.listingSlug ?? null,
  };
  if (status.paymentStatus === 'succeeded' && flow) {
    return data(payload, {
      headers: { 'Set-Cookie': await getCheckoutFlowService().destroy(request) },
    });
  }
  return payload;
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const locale = params.locale === 'en' ? 'en' : 'vi';

  if (intent === 'verify-access') {
    const otp = String(form.get('otp') ?? '').trim();
    if (!otp) return data({ ok: false, error: 'OTP_REQUIRED' }, { status: 400 });
    const booking = await fetchBookingByCode(request, params.code, otp).catch(() => null);
    if (!booking) return data({ ok: false, error: 'INVALID_OTP' }, { status: 403 });
    const setCookie = await getCheckoutFlowService().create(request, {
      bookingId: booking.id,
      bookingCode: booking.code,
      listingSlug: '',
      locale,
      otp,
    });
    return redirect(storefrontPaths.booking(locale, params.code), {
      headers: { 'Set-Cookie': setCookie },
    });
  }

  if (intent === 'mock-pay') {
    const result = await mockPay(request, params.code);
    return data(
      { ok: result.ok, error: result.error ?? null },
      { status: result.ok ? 200 : errorStatus(result.status) },
    );
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
    const destination = checkout.data?.destination;
    if (
      checkout.ok &&
      destination?.type === 'redirect' &&
      isMockPaymentRedirect(destination.paymentUrl)
    ) {
      return redirect(storefrontPaths.booking(locale, params.code));
    }
    if (checkout.ok && destination?.type === 'form_post') {
      const handoff = allowedPaymentFormPost(destination);
      if (handoff) return { ok: true, error: null, handoff };
    }
    const paymentUrl =
      destination?.type === 'redirect' ? allowedPaymentRedirect(destination.paymentUrl) : null;
    if (checkout.ok && paymentUrl) {
      return redirect(paymentUrl);
    }
    return data(
      {
        ok: false,
        error:
          checkout.ok && !paymentUrl
            ? 'INVALID_PAYMENT_REDIRECT'
            : (checkout.error ?? checkout.code ?? 'PAYMENT_RETRY_FAILED'),
      },
      { status: checkout.ok ? 502 : errorStatus(checkout.status) },
    );
  }
  if (intent === 'cancel') {
    const flow = await getCheckoutFlowService().readForCode(request, params.code);
    const otp = String(form.get('otp') ?? '').trim() || flow?.record.otp;
    const reason = String(form.get('reason') ?? '').trim() || undefined;
    const result = await cancelBooking(request, params.code, { reason, otp });
    return data(
      { ok: result.ok, error: result.error ?? null },
      { status: result.ok ? 200 : errorStatus(result.status) },
    );
  }
  return data({ ok: false, error: 'UNKNOWN_INTENT' }, { status: 400 });
}

export default function BookingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { code, status, mockEnabled, canRetry, listingSlug } = loaderData;
  const { t } = useTranslation([NsI18n.Booking, NsI18n.Error]);
  const { currentUser } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const [sp] = useSearchParams();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  const bookingStatus = normalizeBookingStatus(status.bookingStatus);
  const paymentOutcome = sp.get('payment');
  const paymentFailed =
    paymentOutcome === 'cancel' ||
    paymentOutcome === 'error' ||
    // Backward compatibility for checkout links created before the SePay redirect normalization.
    sp.get('cancelled') === '1' ||
    status.paymentStatus === 'failed' ||
    status.paymentStatus === 'expired' ||
    bookingStatus === 'expired' ||
    bookingStatus === 'rejected';
  const isSuccess =
    !paymentFailed &&
    (status.paymentStatus === 'succeeded' ||
      (bookingStatus !== null && SUCCESS.has(bookingStatus)));
  const isPending =
    !paymentFailed && !isSuccess && bookingStatus !== null && PENDING.has(bookingStatus);

  // Poll while pending (the webhook — not the return URL — confirms payment, §11.2).
  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => {
      if (revalidator.state === 'idle') revalidator.revalidate();
    }, 3000);
    return () => clearInterval(id);
  }, [isPending, revalidator]);

  if (actionData && 'handoff' in actionData && actionData.handoff) {
    return <PaymentHandoff destination={actionData.handoff} />;
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

              {actionData && !actionData.ok && actionData.error ? (
                <p
                  role="alert"
                  className="rounded-sm border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
                >
                  {actionData.error === 'PAYMENT_RETRY_UNAVAILABLE'
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

              {isSuccess && currentUser ? (
                <Button asChild className="h-12 w-full rounded-sm text-base">
                  <Link to={storefrontPaths.bookings(locale)}>
                    <History data-icon="inline-start" />
                    {t('bookingHistory')}
                  </Link>
                </Button>
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
              <Row label={t('code')} value={code} mono />
              {bookingStatus ? (
                <Row label={t('status')} value={t(`statusLabels.${bookingStatus}`)} />
              ) : null}
              {status.paidAmount !== '0' ? (
                <Row label={t('payment.paid')} value={formatVnd(status.paidAmount)} />
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Navigation);
  return (
    <RouteErrorState
      error={error}
      homeHref={storefrontPaths.bookings(locale)}
      homeLabel={t('lookup')}
    />
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

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
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
