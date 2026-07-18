import { data, redirect } from 'react-router';
import { z } from 'zod';
import { BookingDetailPanel } from '../../features/account/components/booking-detail-panel';
import { loadAccountBooking } from '../../features/account/server/booking-history.server';
import { cancelBooking, checkoutBooking } from '../../lib/booking.server';
import { errorStatus } from '../../lib/http-status';
import { storefrontPaths } from '../../lib/locale-paths';
import { allowedPaymentRedirect } from '../../lib/payment-redirect.server';
import { requireAuth } from '../../lib/auth.server';
import type { Route } from './+types/booking-detail';

const bookingActionSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('pay') }),
  z.object({
    intent: z.literal('cancel'),
    reason: z.string().trim().min(1, 'CANCEL_REASON_REQUIRED').max(500),
  }),
]);

export function meta() {
  return [{ title: 'Booking history | Bookify' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const url = new URL(request.url);
  requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const booking = await loadAccountBooking(request, params.code, locale);
  if (!booking) throw new Response('Booking not found', { status: 404 });
  return { locale, booking, defaultCancelOpen: url.searchParams.get('cancel') === '1' };
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  const formData = await request.formData();
  const parsed = bookingActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data({ ok: false, error: 'CANCEL_REASON_REQUIRED' }, { status: 400 });
  }

  const booking = await loadAccountBooking(request, params.code, locale);
  if (!booking) return data({ ok: false, error: 'BOOKING_NOT_FOUND' }, { status: 404 });

  if (booking.demo) {
    if (parsed.data.intent === 'pay' && booking.status !== 'pending_payment') {
      return data({ ok: false, error: 'PAYMENT_NOT_AVAILABLE' }, { status: 409 });
    }
    if (parsed.data.intent === 'cancel' && booking.status !== 'confirmed') {
      return data({ ok: false, error: 'CANCELLATION_NOT_AVAILABLE' }, { status: 409 });
    }
    const demoCode = parsed.data.intent === 'pay' ? 'DEMO-UPCOMING' : 'DEMO-CANCELLED';
    return redirect(storefrontPaths.account.booking(locale, demoCode));
  }

  if (parsed.data.intent === 'pay') {
    if (booking.status !== 'pending_payment') {
      return data({ ok: false, error: 'PAYMENT_NOT_AVAILABLE' }, { status: 409 });
    }
    const result = await checkoutBooking(request, booking.id);
    const paymentUrl = allowedPaymentRedirect(result.data?.paymentUrl);
    if (result.ok && paymentUrl) return redirect(paymentUrl);
    return data(
      {
        ok: false,
        error:
          result.ok && !paymentUrl
            ? 'INVALID_PAYMENT_REDIRECT'
            : (result.error ?? result.code ?? 'PAYMENT_FAILED'),
      },
      { status: result.ok ? 502 : errorStatus(result.status) },
    );
  }

  if (booking.status !== 'confirmed') {
    return data({ ok: false, error: 'CANCELLATION_NOT_AVAILABLE' }, { status: 409 });
  }
  const result = await cancelBooking(request, booking.code, { reason: parsed.data.reason });
  if (!result.ok) {
    return data(
      { ok: false, error: result.error ?? result.code ?? 'CANCELLATION_FAILED' },
      { status: errorStatus(result.status) },
    );
  }
  return redirect(storefrontPaths.account.booking(locale, booking.code));
}

export default function AccountBookingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const locale = loaderData.locale === 'en' ? 'en' : 'vi';
  return (
    <BookingDetailPanel
      booking={loaderData.booking}
      locale={locale}
      defaultCancelOpen={loaderData.defaultCancelOpen}
      actionError={actionData && !actionData.ok ? actionData.error : null}
    />
  );
}
