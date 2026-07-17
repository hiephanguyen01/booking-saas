import type { CreateBookingInput, ValidatePromoResponse } from '@booking/contracts';
import { data, redirect } from 'react-router';
import type { Route } from './+types/checkout';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CheckoutPage } from '../features/checkout/checkout-page';
import { readRefCode } from '../lib/affiliate.server';
import { checkoutBooking, createBooking, validatePromo } from '../lib/booking.server';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { buildCheckoutIdempotencyKey } from '../lib/checkout-idempotency.server';
import { appendRecentCookie } from '../lib/recent.server';
import { resolveTenant } from '../lib/tenant.server';
import { storefrontPaths } from '../lib/locale-paths';
import { getOptionalAuth } from '../lib/auth.server';
import { getCheckoutFlowService } from '../lib/checkout-flow.server';
import { createTranslator } from '../lib/i18n';
import { allowedPaymentRedirect } from '../lib/payment-redirect.server';
import { errorStatus } from '../lib/http-status';

export function meta({ params }: Route.MetaArgs): Route.MetaDescriptors {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return [
    { title: createTranslator(locale).t('checkout.title') },
    { name: 'robots', content: 'noindex' },
  ];
}

export async function loader({ request, url, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const searchParams = url.searchParams;
  const slug = searchParams.get('listing');
  const mode = searchParams.get('mode');
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const qty = searchParams.get('qty') || '1';
  const promoCode = searchParams.get('promo')?.trim().toUpperCase() || null;

  if (!slug || !mode || !start || !end) {
    throw redirect(slug ? storefrontPaths.listing(locale, slug) : storefrontPaths.home(locale));
  }

  const [listing, quote] = await Promise.all([
    fetchListing(request, slug),
    fetchQuote(
      request,
      slug,
      new URLSearchParams({ mode, from: start, to: end, quantity: qty }),
    ),
  ]);

  if (!listing) throw redirect(storefrontPaths.home(locale));
  if (!quote) throw redirect(storefrontPaths.listing(locale, slug));

  let promo: ValidatePromoResponse | null = null;
  if (promoCode) {
    const result = await validatePromo(request, {
      code: promoCode,
      listingId: listing.id,
      amount: quote.subtotal,
    });
    promo = result.data;
  }

  return {
    listing,
    mode,
    start,
    end,
    qty,
    quote,
    promoCode,
    promo,
    currentUser: getOptionalAuth()?.info.user ?? null,
  };
}

type GuestFields = { fullName: string; email: string; phone: string };

function validateGuest(
  fullNameRaw: FormDataEntryValue | null,
  emailRaw: FormDataEntryValue | null,
  phoneRaw: FormDataEntryValue | null,
): { ok: true; data: GuestFields } | { ok: false; fieldErrors: Record<string, string[]> } {
  const fullName = String(fullNameRaw ?? '').trim();
  const email = String(emailRaw ?? '').trim();
  const phone = String(phoneRaw ?? '').trim();
  const fieldErrors: Record<string, string[]> = {};

  if (fullName.length < 1 || fullName.length > 200) fieldErrors.fullName = ['Required'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = ['Invalid email'];
  if (phone.length < 5 || phone.length > 20) fieldErrors.phone = ['Invalid phone'];
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { fullName, email, phone } };
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const form = await request.formData();
  const listingId = String(form.get('listingId') ?? '');
  const mode = String(form.get('mode') ?? '');
  const start = String(form.get('start') ?? '');
  const end = String(form.get('end') ?? '');
  const qty = Number(form.get('qty') ?? '1') || 1;
  const promoCode = String(form.get('promoCode') ?? '').trim().toUpperCase() || undefined;
  const note = String(form.get('customerNote') ?? '').trim() || undefined;
  const guest = validateGuest(form.get('fullName'), form.get('email'), form.get('phone'));

  if (!guest.ok) {
    return data({ fieldErrors: guest.fieldErrors, error: null }, { status: 400 });
  }

  const tenant = await resolveTenant(request);
  const refCode = readRefCode(request, tenant.id) ?? undefined;
  const input: CreateBookingInput = {
    listingId,
    mode: mode as CreateBookingInput['mode'],
    from: start,
    to: end,
    quantity: qty,
    guestCount: 1,
    customerNote: note,
    guest: guest.data,
    promoCode,
    refCode,
  };

  const idempotencyKey = buildCheckoutIdempotencyKey({
    tenantId: tenant.id,
    listingId,
    mode,
    start,
    end,
    quantity: qty,
    promoCode: promoCode ?? null,
    email: guest.data.email,
    phone: guest.data.phone,
  });
  const created = await createBooking(request, input, idempotencyKey);

  if (!created.ok || !created.data) {
    return data(
      { fieldErrors: null, error: created.error ?? 'BOOKING_FAILED', code: created.code },
      { status: errorStatus(created.status) },
    );
  }

  const booking = created.data;
  const headers = new Headers();
  headers.append('Set-Cookie', appendRecentCookie(request, booking.code));
  headers.append(
    'Set-Cookie',
    await getCheckoutFlowService().create(request, {
      bookingId: booking.id,
      bookingCode: booking.code,
      listingSlug: String(form.get('listingSlug') ?? ''),
      locale,
    }),
  );

  if (booking.status === 'pending_payment') {
    const checkout = await checkoutBooking(request, booking.id);
    if (!checkout.ok) {
      return data(
        {
          fieldErrors: checkout.fieldErrors ?? null,
          error: checkout.error ?? 'PAYMENT_CHECKOUT_FAILED',
          code: checkout.code,
        },
        { status: errorStatus(checkout.status), headers },
      );
    }
    const paymentUrl = allowedPaymentRedirect(checkout.data?.paymentUrl);
    if (!paymentUrl) {
      return data(
        { fieldErrors: null, error: 'INVALID_PAYMENT_REDIRECT', code: 'INVALID_PAYMENT_REDIRECT' },
        { status: 502, headers },
      );
    }
    return redirect(paymentUrl, { headers });
  }

  return redirect(storefrontPaths.booking(locale, booking.code), {
    headers,
  });
}

export default function CheckoutRoute(props: Route.ComponentProps) {
  return <CheckoutPage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return <RouteErrorState error={error} homeHref={storefrontPaths.home(locale)} homeLabel="Về trang chủ" />;
}
