import { useEffect } from 'react';
import { data, Form, Link, useRevalidator, useSearchParams } from 'react-router';
import type { BookingResponse, PaymentStatusResponse } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import { Textarea } from '@booking/ui/components/ui/textarea';
import type { Route } from './+types/booking-detail';
import {
  fetchPaymentStatus,
  fetchBookingByCode,
  mockPay,
  cancelBooking,
  mockPaymentsEnabled,
} from '../lib/booking.server';
import { useT, type I18n } from '../lib/i18n';
import { formatVnd } from '../lib/ui';
import { DEFAULT_TZ, dateLabelInTz, timeInTz } from '../lib/time';

export function meta() {
  return [{ title: 'Booking' }, { name: 'robots', content: 'noindex' }];
}

const PENDING = new Set(['pending_payment', 'pending_approval', 'draft']);
const SUCCESS = new Set(['confirmed', 'completed']);

export async function loader({ request, params }: Route.LoaderArgs) {
  const otp = new URL(request.url).searchParams.get('otp') ?? undefined;
  const status = await fetchPaymentStatus(request, params.code);
  // Full details (schedule/amounts + cancel) are only accessible with the OTP
  // (or a logged-in session) — §8.6. Right after checkout we show status only.
  const booking = otp ? await fetchBookingByCode(request, params.code, otp) : null;
  return { code: params.code, status, booking, mockEnabled: mockPaymentsEnabled(), otp: otp ?? null };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'mock-pay') {
    const result = await mockPay(request, params.code);
    return data({ ok: result.ok, error: result.error ?? null });
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
  const { code, status, booking, mockEnabled } = loaderData;
  const { t } = useT();
  const [sp] = useSearchParams();
  const revalidator = useRevalidator();

  const bookingStatus = status?.bookingStatus ?? booking?.status ?? 'pending_payment';
  const isPending = PENDING.has(bookingStatus);
  const isSuccess = SUCCESS.has(bookingStatus);

  // Poll while pending (the webhook — not the return URL — confirms payment, §11.2).
  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => {
      if (revalidator.state === 'idle') revalidator.revalidate();
    }, 3000);
    return () => clearInterval(id);
  }, [isPending, revalidator]);

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <Card className="rounded-2xl border-black/10">
        <CardContent className="space-y-5 p-6">
          <StatusHeader status={bookingStatus} isSuccess={isSuccess} isPending={isPending} t={t} />

          <div className="space-y-1 text-sm">
            <Row label={t('booking.code')} value={code} mono />
            <Row label={t('booking.status')} value={t(`booking.statusLabels.${bookingStatus}`)} />
            {status && status.paidAmount !== '0' ? (
              <Row label={t('payment.paid')} value={formatVnd(status.paidAmount)} />
            ) : null}
          </div>

          {booking ? <BookingDetails booking={booking} t={t} /> : null}

          {actionData && !actionData.ok && actionData.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionData.error}</p>
          ) : null}

          {isPending ? (
            <PendingActions status={status} mockEnabled={mockEnabled} t={t} />
          ) : null}

          {isSuccess && booking && booking.status === 'confirmed' ? (
            <CancelSection otp={sp.get('otp')} t={t} />
          ) : null}

          <div className="pt-2 text-center">
            <Link to="/bookings" className="text-sm text-(--sf-muted) hover:underline">
              {t('nav.lookup')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusHeader({
  status,
  isSuccess,
  isPending,
  t,
}: {
  status: string;
  isSuccess: boolean;
  isPending: boolean;
  t: I18n['t'];
}) {
  if (isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">{t('payment.succeeded')}</h1>
        <p className="mt-1 text-sm text-(--sf-muted)">{t('payment.confirmedNote')}</p>
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold">{t('payment.title')}</h1>
        <p className="mt-1 text-sm text-(--sf-muted)">{t('payment.pending')}</p>
      </div>
    );
  }
  const failed = status === 'expired' || status === 'rejected';
  return (
    <div className="text-center">
      <h1 className="text-xl font-bold">{t(`booking.statusLabels.${status}`)}</h1>
      {failed ? <p className="mt-1 text-sm text-red-600">{t('payment.failed')}</p> : null}
    </div>
  );
}

function PendingActions({
  status,
  mockEnabled,
  t,
}: {
  status: PaymentStatusResponse | null;
  mockEnabled: boolean;
  t: I18n['t'];
}) {
  // Only offer the mock button while awaiting payment (not while awaiting partner approval).
  const awaitingPayment = status?.bookingStatus === 'pending_payment';
  if (!mockEnabled || !awaitingPayment) {
    return <p className="text-center text-sm text-(--sf-muted)">{t('payment.checking')}</p>;
  }
  return (
    <Form method="post" className="space-y-2">
      <input type="hidden" name="intent" value="mock-pay" />
      <Button type="submit" className="h-11 w-full">
        {t('payment.mockPay')}
      </Button>
      <p className="text-center text-xs text-(--sf-muted)">{t('payment.mockHint')}</p>
    </Form>
  );
}

function BookingDetails({ booking, t }: { booking: BookingResponse; t: I18n['t'] }) {
  const tz = DEFAULT_TZ;
  const isDaily = booking.bookingMode === 'daily';
  const schedule = isDaily
    ? `${dateLabelInTz(booking.startUtc, tz, 'vi')} → ${dateLabelInTz(booking.endUtc, tz, 'vi')}`
    : `${dateLabelInTz(booking.startUtc, tz, 'vi')} · ${timeInTz(booking.startUtc, tz)}–${timeInTz(booking.endUtc, tz)}`;
  return (
    <>
      <Separator />
      <div className="space-y-1 text-sm">
        <Row label={t('booking.schedule')} value={schedule} />
        <Row label={t('checkout.total')} value={formatVnd(booking.finalAmount)} />
        {booking.securityDeposit !== '0' ? (
          <Row label={t('listing.securityDeposit')} value={formatVnd(booking.securityDeposit)} />
        ) : null}
      </div>
    </>
  );
}

function CancelSection({ otp, t }: { otp: string | null; t: I18n['t'] }) {
  return (
    <details className="rounded-lg border border-black/10 p-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-700">{t('booking.cancel')}</summary>
      <Form method="post" className="mt-3 space-y-2">
        <input type="hidden" name="intent" value="cancel" />
        {otp ? <input type="hidden" name="otp" value={otp} /> : null}
        <Textarea name="reason" placeholder={t('booking.cancelReason')} rows={2} />
        <Button type="submit" variant="destructive" size="sm">
          {t('booking.cancelConfirm')}
        </Button>
      </Form>
    </details>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-(--sf-muted)">{label}</span>
      <span className={mono ? 'font-mono font-semibold' : 'font-medium text-gray-900'}>{value}</span>
    </div>
  );
}
