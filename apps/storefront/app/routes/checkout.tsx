import { data, redirect, Form, Link, useSearchParams } from 'react-router';
import type { CreateBookingInput, ValidatePromoResponse } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Separator } from '@booking/ui/components/ui/separator';
import type { Route } from './+types/checkout';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { validatePromo, createBooking, checkoutBooking } from '../lib/booking.server';
import { appendRecentCookie } from '../lib/recent.server';
import { useT, type I18n } from '../lib/i18n';
import { formatVnd } from '../lib/ui';
import { DEFAULT_TZ, timeInTz, dateLabelInTz } from '../lib/time';

export function meta() {
  return [{ title: 'Checkout' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const sp = new URL(request.url).searchParams;
  const slug = sp.get('listing');
  const mode = sp.get('mode');
  const start = sp.get('start');
  const end = sp.get('end');
  const qty = sp.get('qty') || '1';
  const promoCode = sp.get('promo')?.trim().toUpperCase() || null;

  if (!slug || !mode || !start || !end) throw redirect(slug ? `/l/${slug}` : '/');
  // Independent fetches — the quote is keyed by slug + params, not the listing result.
  const [listing, quote] = await Promise.all([
    fetchListing(request, slug),
    fetchQuote(request, slug, new URLSearchParams({ mode, from: start, to: end, quantity: qty })),
  ]);
  if (!listing) throw redirect('/');
  if (!quote) throw redirect(`/l/${slug}`);

  let promo: ValidatePromoResponse | null = null;
  if (promoCode) {
    const result = await validatePromo(request, {
      code: promoCode,
      listingId: listing.id,
      amount: quote.subtotal,
    });
    promo = result.data;
  }

  return { listing, mode, start, end, qty, quote, promoCode, promo };
}

type GuestFields = { fullName: string; email: string; phone: string };

/**
 * Lightweight guest validation mirroring `guestInfoSchema` (§8.6). Kept inline so
 * the storefront never imports a runtime value from `@booking/shared` (whose ESM
 * build does assertion-less JSON imports); the backend re-validates with the real
 * schema and returns any additional field errors.
 */
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

export async function action({ request }: Route.ActionArgs) {
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
  };

  // Deterministic idempotency key: a resubmit (double-click / validation retry)
  // for the same slot + guest returns the existing booking, never a duplicate.
  const idem = `co:${listingId}:${start}:${guest.data.email}`;
  const created = await createBooking(request, input, idem);
  if (!created.ok || !created.data) {
    return data({ fieldErrors: null, error: created.error ?? 'BOOKING_FAILED', code: created.code }, { status: 400 });
  }

  const booking = created.data;
  const setCookie = appendRecentCookie(request, booking.code);

  if (booking.status === 'pending_payment') {
    const checkout = await checkoutBooking(request, booking.id);
    if (checkout.ok && checkout.data && /^https?:/i.test(checkout.data.paymentUrl)) {
      // Real gateway (PayOS): hand off to its hosted page; it returns to /bookings/:code.
      return redirect(checkout.data.paymentUrl, { headers: { 'Set-Cookie': setCookie } });
    }
  }
  // Mock gateway or pending approval → our own confirmation page.
  return redirect(`/bookings/${booking.code}`, { headers: { 'Set-Cookie': setCookie } });
}

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, mode, start, end, qty, quote, promoCode, promo } = loaderData;
  const { t } = useT();
  const [sp] = useSearchParams();
  const fieldErrors = actionData?.fieldErrors ?? null;
  const serverError = actionData?.error ?? null;

  const discount = promo?.valid ? promo.discountAmount : '0';
  const finalAmount = promo?.valid ? promo.finalAmount : quote.subtotal;
  const dueNow = promo?.valid
    ? subtractDeposit(quote, promo)
    : quote.depositAmount;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link to={`/l/${listing.slug}`} className="text-sm text-(--sf-muted) hover:underline">
          ← {listing.title}
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('checkout.title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          <GuestForm
            listing={listing}
            mode={mode}
            start={start}
            end={end}
            qty={qty}
            promoCode={promo?.valid ? promoCode : null}
            fieldErrors={fieldErrors}
            serverError={serverError}
            t={t}
          />
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <SummaryCard
            listing={listing}
            mode={mode}
            start={start}
            end={end}
            qty={qty}
            quote={quote}
            discount={discount}
            finalAmount={finalAmount}
            dueNow={dueNow}
            t={t}
          />
          <PromoForm
            searchParams={sp}
            promoCode={promoCode}
            promo={promo}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

/** With a promo, the deposit is proportional to the discounted total. */
function subtractDeposit(quote: { subtotal: string; depositAmount: string }, promo: ValidatePromoResponse): string {
  const subtotal = Number(quote.subtotal);
  const deposit = Number(quote.depositAmount);
  const final = Number(promo.finalAmount);
  if (subtotal <= 0) return quote.depositAmount;
  const ratio = deposit / subtotal;
  return String(Math.round(final * ratio));
}

function scheduleLabel(mode: string, start: string, end: string, qty: string, t: I18n['t']): string {
  const tz = DEFAULT_TZ;
  if (mode === 'daily') {
    return `${dateLabelInTz(start, tz, 'vi')} → ${dateLabelInTz(end, tz, 'vi')}`;
  }
  if (mode === 'inventory') {
    return `${dateLabelInTz(start, tz, 'vi')} → ${dateLabelInTz(end, tz, 'vi')} · ${t('listing.quantity')}: ${qty}`;
  }
  return `${dateLabelInTz(start, tz, 'vi')} · ${timeInTz(start, tz)}–${timeInTz(end, tz)}`;
}

function SummaryCard({
  listing,
  mode,
  start,
  end,
  qty,
  quote,
  discount,
  finalAmount,
  dueNow,
  t,
}: {
  listing: { title: string };
  mode: string;
  start: string;
  end: string;
  qty: string;
  quote: { subtotal: string; securityDeposit: string };
  discount: string;
  finalAmount: string;
  dueNow: string;
  t: I18n['t'];
}) {
  return (
    <Card className="rounded-2xl border-black/10">
      <CardContent className="space-y-3 p-5 text-sm">
        <div className="font-semibold text-gray-900">{listing.title}</div>
        <div className="text-(--sf-muted)">{scheduleLabel(mode, start, end, qty, t)}</div>
        <Separator />
        <Row label={t('listing.subtotal')} value={formatVnd(quote.subtotal)} />
        {discount !== '0' ? (
          <Row label={t('checkout.discount')} value={`− ${formatVnd(discount)}`} accent />
        ) : null}
        {quote.securityDeposit !== '0' ? (
          <Row label={t('listing.securityDeposit')} value={formatVnd(quote.securityDeposit)} />
        ) : null}
        <Separator />
        <Row label={t('checkout.total')} value={formatVnd(finalAmount)} bold />
        <Row label={t('checkout.dueNow')} value={formatVnd(dueNow)} bold />
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string | null; bold?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'} ${accent ? 'text-(--sf-primary)' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PromoForm({
  searchParams,
  promoCode,
  promo,
  t,
}: {
  searchParams: URLSearchParams;
  promoCode: string | null;
  promo: ValidatePromoResponse | null;
  t: I18n['t'];
}) {
  // Preserve the current selection when (re)submitting the promo via GET.
  const hidden = ['listing', 'mode', 'start', 'end', 'qty'].map((k) => [k, searchParams.get(k) ?? ''] as const);
  const applied = promo?.valid ?? false;
  const errorCode = promo && !promo.valid ? promo.error : undefined;

  return (
    <Card className="rounded-2xl border-black/10">
      <CardContent className="space-y-2 p-5">
        <div className="text-sm font-semibold">{t('checkout.promoSection')}</div>
        {applied ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-(--sf-primary)/10 px-3 py-2 text-sm">
            <span className="font-medium text-(--sf-primary)">
              {t('checkout.promoApplied', { code: promoCode ?? '', amount: formatVnd(promo!.discountAmount) ?? '' })}
            </span>
            <Link
              to={promoRemoveUrl(hidden)}
              className="text-xs font-semibold text-gray-500 hover:underline"
            >
              {t('checkout.promoRemove')}
            </Link>
          </div>
        ) : (
          <Form method="get" className="flex gap-2">
            {hidden.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <Input
              name="promo"
              defaultValue={promoCode ?? ''}
              placeholder={t('checkout.promoPlaceholder')}
              className="h-10 uppercase"
            />
            <Button type="submit" variant="outline" className="h-10">
              {t('checkout.promoApply')}
            </Button>
          </Form>
        )}
        {errorCode ? (
          <p className="text-sm text-red-600">{t(`promoErrors.${errorCode}`)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function promoRemoveUrl(hidden: readonly (readonly [string, string])[]): string {
  const params = new URLSearchParams(hidden.map(([k, v]) => [k, v]));
  return `/checkout?${params.toString()}`;
}

function GuestForm({
  listing,
  mode,
  start,
  end,
  qty,
  promoCode,
  fieldErrors,
  serverError,
  t,
}: {
  listing: { id: string };
  mode: string;
  start: string;
  end: string;
  qty: string;
  promoCode: string | null;
  fieldErrors: Partial<Record<string, string[]>> | null;
  serverError: string | null;
  t: I18n['t'];
}) {
  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="listingId" value={listing.id} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />
      <input type="hidden" name="qty" value={qty} />
      {promoCode ? <input type="hidden" name="promoCode" value={promoCode} /> : null}

      <h2 className="text-lg font-semibold">{t('checkout.guestSection')}</h2>
      {serverError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      ) : null}

      <GuestField name="fullName" label={t('checkout.fullName')} autoComplete="name" errors={fieldErrors?.fullName} />
      <div className="grid gap-4 sm:grid-cols-2">
        <GuestField name="email" type="email" label={t('checkout.email')} autoComplete="email" errors={fieldErrors?.email} />
        <GuestField name="phone" label={t('checkout.phone')} autoComplete="tel" errors={fieldErrors?.phone} />
      </div>
      <GuestField name="customerNote" label={t('checkout.note')} errors={undefined} />

      <Button type="submit" className="h-11 w-full text-base">
        {t('checkout.payNow')}
      </Button>
    </Form>
  );
}

function GuestField({
  name,
  label,
  type = 'text',
  autoComplete,
  errors,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  errors?: string[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <Input name={name} type={type} autoComplete={autoComplete} aria-invalid={errors ? true : undefined} />
      {errors?.length ? <span className="text-xs text-red-600">{errors[0]}</span> : null}
    </label>
  );
}
