import type { CurrentUser, ValidatePromoResponse } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import { Input } from '@booking/ui/components/ui/input';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { cn } from '@booking/ui/lib/utils';
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Landmark,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  QrCode,
  Star,
  TicketPercent,
  UserRound,
} from 'lucide-react';
import { Form, Link, useLocation, useNavigation, useSearchParams } from 'react-router';
import type { Route } from '../../routes/+types/checkout';
import { NsI18n, type ScopedI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { dateLabelInTz, DEFAULT_TZ, timeInTz } from '../../lib/time';
import { formatListingLocation, formatVnd } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';
import {
  checkoutAmounts,
  checkoutListingPresentation,
  policyLines,
} from './checkout-presentation';

export function CheckoutPage({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, mode, start, end, qty, quote, promoCode, promo, currentUser } = loaderData;
  const { t } = useTranslation(NsI18n.Checkout);
  const { t: tListing } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const location = useLocation();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const metadata = checkoutListingPresentation(listing.id);
  const amounts = checkoutAmounts(quote, promo?.valid ? promo : null);
  const checkoutPath = `${location.pathname}${location.search}`;
  const submitting = navigation.state === 'submitting';
  const copy = locale === 'vi' ? viCopy : enCopy;

  return (
    <div className="bg-[#f8fafb] py-4 sm:py-6 lg:py-8">
      <main className="mx-auto w-full max-w-[1218px] px-4 sm:px-6">
        <h1 className="sr-only">{t('title')}</h1>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <BookingColumn
            listing={listing}
            metadata={metadata}
            mode={mode}
            start={start}
            end={end}
            qty={qty}
            locale={locale}
            policies={policyLines(listing.cancellationPolicy)}
            searchParams={searchParams}
            promoCode={promoCode}
            promo={promo}
            quote={quote}
            amounts={amounts}
            t={t}
            tListing={tListing}
            copy={copy}
          />

          <div className="flex min-w-0 flex-col gap-4">
            {!currentUser ? (
              <MemberBanner
                loginHref={storefrontPaths.login(locale, checkoutPath)}
                registerHref={`${storefrontPaths.register(locale)}?redirectTo=${encodeURIComponent(checkoutPath)}`}
                copy={copy}
              />
            ) : null}

            <CheckoutForm
              listingId={listing.id}
              listingSlug={listing.slug}
              mode={mode}
              start={start}
              end={end}
              qty={qty}
              promoCode={promo?.valid ? promoCode : null}
              currentUser={currentUser}
              fieldErrors={actionData?.fieldErrors ?? null}
              serverError={actionData?.error ?? null}
              dueNow={amounts.dueNow}
              submitting={submitting}
              copy={copy}
              t={t}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

type CheckoutCopy = { [Key in keyof typeof viCopy]: string };

const viCopy = {
  promotions: 'Khuyến mãi dành cho bạn',
  memberTitle:
    'Trở thành khách hàng thân thiết của Booking Studio để có cơ hội nhận nhiều ưu đãi hấp dẫn',
  login: 'Đăng nhập',
  register: 'Đăng ký',
  contact: 'Thông tin liên hệ',
  paymentTitle: 'Thanh toán',
  payment: 'Phương thức thanh toán',
  paymentHint: 'Tiền cọc',
  payos: 'PayOS QRCode',
  transfer: 'Chuyển khoản',
  internationalCard: 'Visa/Master/JCB',
  domesticCard: 'Thẻ ATM nội địa',
  soon: 'Sắp hỗ trợ',
  submit: 'Đặt đơn',
  submitting: 'Đang tạo đơn…',
  bookingCount: 'đơn đặt',
  cancellation: 'Chính sách hủy',
  promoCount: 'Mã khuyến mãi',
  room: 'phòng',
  slots: 'khung giờ',
  totalIncludes: 'Giá đã bao gồm: Thuế 8%, Phí dịch vụ 5%',
  notePlaceholder: 'Lời nhắn của bạn',
} as const;

const enCopy: CheckoutCopy = {
  promotions: 'Offers for you',
  memberTitle: 'Become a Booking Studio member to receive more exclusive offers',
  login: 'Log in',
  register: 'Register',
  contact: 'Contact details',
  paymentTitle: 'Payment',
  payment: 'Payment method',
  paymentHint: 'Deposit',
  payos: 'PayOS QRCode',
  transfer: 'Bank transfer',
  internationalCard: 'Visa/Master/JCB',
  domesticCard: 'Domestic ATM card',
  soon: 'Coming soon',
  submit: 'Place booking',
  submitting: 'Creating booking…',
  bookingCount: 'bookings',
  cancellation: 'Cancellation policy',
  promoCount: 'promo codes',
  room: 'room',
  slots: 'time slots',
  totalIncludes: 'Price includes 8% tax and 5% service fee',
  notePlaceholder: 'Your message',
};

function BookingColumn({
  listing,
  metadata,
  mode,
  start,
  end,
  qty,
  locale,
  policies,
  searchParams,
  promoCode,
  promo,
  quote,
  amounts,
  t,
  tListing,
  copy,
}: {
  listing: Route.ComponentProps['loaderData']['listing'];
  metadata: ReturnType<typeof checkoutListingPresentation>;
  mode: string;
  start: string;
  end: string;
  qty: string;
  locale: 'vi' | 'en';
  policies: string[];
  searchParams: URLSearchParams;
  promoCode: string | null;
  promo: ValidatePromoResponse | null;
  quote: Route.ComponentProps['loaderData']['quote'];
  amounts: ReturnType<typeof checkoutAmounts>;
  t: ScopedI18n<NsI18n.Checkout>['t'];
  tListing: ScopedI18n<NsI18n.Listing>['t'];
  copy: CheckoutCopy;
}) {
  const address = formatListingLocation(listing, 'full');
  const scheduleBadges = buildScheduleBadges(mode, start, end, qty, locale, tListing);
  const slotCount = mode === 'hourly' ? Math.max(1, scheduleBadges.length) : 1;

  return (
    <section className="bg-white p-5 shadow-[0_0_16px_rgba(0,0,0,0.04)] sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base leading-6 font-semibold text-[#1d2939]">
          {listing.group?.title ?? listing.title}
        </h2>
        {address ? (
          <p className="flex items-center gap-2 text-xs leading-4 text-[#667085]">
            <MapPin className="size-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
            <span>{address}</span>
          </p>
        ) : null}
        <div className="flex items-center gap-2 text-xs leading-4">
          <span className="flex items-center gap-0 text-[#ffa500]" aria-label={`${metadata.rating}/5`}>
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} className="size-[18px] fill-current" strokeWidth={0} aria-hidden="true" />
            ))}
          </span>
          <span className="font-medium text-[#344054]">{metadata.rating.toFixed(1)}</span>
          <span className="h-[18px] w-px bg-[#d0d5dd]" aria-hidden="true" />
          <span className="font-medium text-[#344054]">
            {metadata.bookingCount}{' '}
            <span className="font-normal text-[#667085]">{copy.bookingCount}</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-4">
        <div className="h-[110px] w-[156px] shrink-0 overflow-hidden bg-[#f2f4f7]">
          {listing.photos[0] ? (
            <img
              src={listing.photos[0]}
              alt={listing.title}
              width={312}
              height={220}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-[#98a2b3]">
              <CalendarDays className="size-7" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm leading-5 font-medium text-[#1d2939]">{listing.title}</h3>
          <p className="mt-3 flex items-center gap-1 text-xs leading-4 font-medium text-[#344054]">
            <CalendarDays className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
            {dateLabelInTz(start, DEFAULT_TZ, locale)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scheduleBadges.map((label) => (
              <span
                key={label}
                className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-xs leading-4 font-medium text-[#475467]"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm leading-5 font-medium text-[#101828]">{copy.cancellation}</h3>
        <div className="mt-2 flex flex-col gap-2">
          {policies.map((policy, index) => (
            <p
              key={policy}
              className={`flex items-start gap-2 text-sm leading-5 ${index === 0 ? 'text-[#009b76]' : 'text-[#1d2939]'}`}
            >
              <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span>{policy}</span>
            </p>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="max-w-[190px] text-sm leading-5 font-semibold text-[#1d2939]">
            {copy.promotions}
          </h3>
          <PromoForm
            searchParams={searchParams}
            promoCode={promoCode}
            promo={promo}
            locale={locale}
            t={t}
            copy={copy}
          />
        </div>
        <PricePanel
          quote={quote}
          promo={promo}
          amounts={amounts}
          qty={qty}
          mode={mode}
          slotCount={slotCount}
          t={t}
          tListing={tListing}
          copy={copy}
        />
      </div>
    </section>
  );
}

function MemberBanner({
  loginHref,
  registerHref,
  copy,
}: {
  loginHref: string;
  registerHref: string;
  copy: CheckoutCopy;
}) {
  return (
    <aside className="bg-white p-5 shadow-[0_0_16px_rgba(0,0,0,0.04)] sm:p-6">
      <p className="max-w-[530px] text-sm leading-5 text-[#344054]">{copy.memberTitle}</p>
      <div className="mt-4 flex items-center gap-10 sm:gap-14">
        <Link to={loginHref} className="min-h-5 text-sm leading-5 font-medium text-[#009b76] hover:underline">
          {copy.login}
        </Link>
        <Link to={registerHref} className="min-h-5 text-sm leading-5 font-medium text-[#009b76] hover:underline">
          {copy.register}
        </Link>
      </div>
    </aside>
  );
}

function PricePanel({
  quote,
  promo,
  amounts,
  qty,
  mode,
  slotCount,
  t,
  tListing,
  copy,
}: {
  quote: Route.ComponentProps['loaderData']['quote'];
  promo: ValidatePromoResponse | null;
  amounts: ReturnType<typeof checkoutAmounts>;
  qty: string;
  mode: string;
  slotCount: number;
  t: ScopedI18n<NsI18n.Checkout>['t'];
  tListing: ScopedI18n<NsI18n.Listing>['t'];
  copy: CheckoutCopy;
}) {
  const hasDiscount = amounts.discount !== '0';
  const quantity = mode === 'inventory' ? qty : '1';
  return (
    <div className="mt-3 bg-[#ebfef6] px-5 py-4 text-sm leading-5 text-[#1d2939]">
      {hasDiscount ? (
        <div className="flex items-center justify-between gap-4">
          <span className="bg-[#ff7167] px-2 py-0.5 text-xs leading-4 font-semibold text-white">
            {promo?.code ?? t('discount')}
          </span>
          <span className="text-[#667085] line-through">{formatVnd(amounts.subtotal)}</span>
        </div>
      ) : null}
      <PriceRow
        label={`${quantity} ${copy.room} × ${slotCount} ${copy.slots}`}
        value={formatVnd(amounts.subtotal)}
        className={hasDiscount ? 'mt-2' : ''}
      />
      <PriceRow label={t('discount')} value={`− ${formatVnd(amounts.discount)}`} className="mt-2" />
      {quote.securityDeposit !== '0' ? (
        <PriceRow
          label={tListing('securityDeposit')}
          value={formatVnd(quote.securityDeposit)}
          className="mt-2"
        />
      ) : null}
      <PriceRow
        label={t('total')}
        value={formatVnd(amounts.finalAmount)}
        className="mt-2 text-base leading-6 font-semibold"
      />
      <p className="mt-0.5 text-xs leading-4 text-[#667085]">{copy.totalIncludes}</p>
    </div>
  );
}

function PriceRow({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <span>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function PromoForm({
  searchParams,
  promoCode,
  promo,
  locale,
  t,
  copy,
}: {
  searchParams: URLSearchParams;
  promoCode: string | null;
  promo: ValidatePromoResponse | null;
  locale: 'vi' | 'en';
  t: ScopedI18n<NsI18n.Checkout>['t'];
  copy: CheckoutCopy;
}) {
  const hidden = ['listing', 'mode', 'start', 'end', 'qty'].map(
    (key) => [key, searchParams.get(key) ?? ''] as const,
  );
  const applied = promo?.valid ?? false;
  const errorCode = promo && !promo.valid ? promo.error : undefined;

  return (
    <details className="group relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm leading-5 font-medium text-[#009b76] marker:hidden">
        <TicketPercent className="size-5" strokeWidth={1.6} aria-hidden="true" />
        <span>{applied ? promoCode : `2 ${copy.promoCount}`}</span>
        <ChevronRight className="size-5 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="absolute top-8 right-0 z-20 w-[290px] border border-[#eaecf0] bg-white p-3 shadow-lg">
        {applied ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-[#009b76]">
              {t('promoApplied', {
                code: promoCode ?? '',
                amount: formatVnd(promo!.discountAmount) ?? '',
              })}
            </span>
            <Link to={promoRemoveUrl(hidden, locale)} className="shrink-0 text-xs font-semibold hover:underline">
              {t('promoRemove')}
            </Link>
          </div>
        ) : (
          <Form method="get" className="flex gap-2">
            {hidden.map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <Input
              name="promo"
              defaultValue={promoCode ?? ''}
              placeholder={t('promoPlaceholder')}
              className="h-10 rounded-sm uppercase"
            />
            <Button type="submit" variant="outline" className="h-10 rounded-sm">
              {t('promoApply')}
            </Button>
          </Form>
        )}
        {errorCode ? <p className="mt-2 text-xs text-destructive">{t(`promoErrors.${errorCode}`)}</p> : null}
      </div>
    </details>
  );
}

function promoRemoveUrl(
  hidden: readonly (readonly [string, string])[],
  locale: 'vi' | 'en',
): string {
  const params = new URLSearchParams(hidden.map(([key, value]) => [key, value]));
  return `${storefrontPaths.checkout(locale)}?${params.toString()}`;
}

function CheckoutForm({
  listingId,
  listingSlug,
  mode,
  start,
  end,
  qty,
  promoCode,
  currentUser,
  fieldErrors,
  serverError,
  dueNow,
  submitting,
  copy,
  t,
}: {
  listingId: string;
  listingSlug: string;
  mode: string;
  start: string;
  end: string;
  qty: string;
  promoCode: string | null;
  currentUser: CurrentUser | null;
  fieldErrors: Partial<Record<string, string[]>> | null;
  serverError: string | null;
  dueNow: string;
  submitting: boolean;
  copy: CheckoutCopy;
  t: ScopedI18n<NsI18n.Checkout>['t'];
}) {
  return (
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="listingSlug" value={listingSlug} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="start" value={start} />
        <input type="hidden" name="end" value={end} />
        <input type="hidden" name="qty" value={qty} />
        {promoCode ? <input type="hidden" name="promoCode" value={promoCode} /> : null}

        <section className="bg-white p-5 shadow-[0_0_16px_rgba(0,0,0,0.04)] sm:p-6">
          <h2 className="text-base leading-6 font-semibold text-[#1d2939]">{copy.contact}</h2>
          {serverError ? (
            <Alert variant="destructive" className="mt-4 rounded-sm">
              <AlertDescription>{checkoutError(serverError, t)}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="mt-4 gap-4">
            <ContactField
              name="fullName"
              label={t('fullName')}
              icon={UserRound}
              autoComplete="name"
              defaultValue={currentUser?.fullName ?? ''}
              errors={fieldErrors?.fullName}
            />
            <ContactField
              name="phone"
              label={t('phone')}
              icon={Phone}
              autoComplete="tel"
              defaultValue={currentUser?.phone ?? ''}
              errors={fieldErrors?.phone}
            />
            <ContactField
              name="email"
              type="email"
              label={t('email')}
              icon={Mail}
              autoComplete="email"
              defaultValue={currentUser?.email ?? ''}
              errors={fieldErrors?.email}
            />
            <ContactField
              name="customerNote"
              label={copy.notePlaceholder}
              icon={PencilLine}
              defaultValue=""
            />
          </FieldGroup>
        </section>

        <section className="bg-white p-5 shadow-[0_0_16px_rgba(0,0,0,0.04)] sm:p-6">
          <h2 className="text-base leading-6 font-semibold text-[#1d2939]">{copy.paymentTitle}</h2>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm leading-5 font-medium text-[#344054]">{copy.paymentHint}</span>
            <strong className="text-base leading-6 font-semibold text-primary">{formatVnd(dueNow)}</strong>
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm leading-5 font-medium text-[#344054]">{copy.payment}</legend>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PaymentMethod icon={QrCode} label={copy.payos} active />
              {currentUser ? (
                <>
                  <PaymentMethod icon={Landmark} label={copy.transfer} disabled copy={copy} />
                  <PaymentMethod icon={CreditCard} label={copy.internationalCard} disabled copy={copy} />
                  <PaymentMethod icon={Banknote} label={copy.domesticCard} disabled copy={copy} />
                </>
              ) : null}
            </div>
          </fieldset>
        </section>
        <Button
          type="submit"
          className="h-12 w-full rounded-sm text-base font-semibold lg:ml-auto lg:w-[280px]"
          disabled={submitting}
        >
          {submitting ? <Spinner data-icon="inline-start" /> : null}
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </Form>
  );
}

function ContactField({
  name,
  label,
  icon: Icon,
  type = 'text',
  autoComplete,
  defaultValue,
  errors,
}: {
  name: string;
  label: string;
  icon: typeof UserRound;
  type?: string;
  autoComplete?: string;
  defaultValue: string;
  errors?: string[];
}) {
  const invalid = Boolean(errors?.length);
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={name} className="sr-only">
        {label}
      </FieldLabel>
      <div className="relative">
        <Icon
          className={cn(
            'pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2',
            invalid ? 'text-destructive' : 'text-[#667085]',
          )}
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <Input
          id={name}
          name={name}
          type={type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          placeholder={label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${name}-error` : undefined}
          className="h-11 rounded-sm border-[#d0d5dd] pl-9 text-sm shadow-none placeholder:text-[#667085]"
        />
        {invalid ? (
          <CircleAlert
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-destructive"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <FieldError id={`${name}-error`} className="mt-1 text-xs leading-4">
        {invalid ? friendlyFieldError(name, errors?.[0]) : null}
      </FieldError>
    </Field>
  );
}

function PaymentMethod({
  icon: Icon,
  label,
  active,
  disabled,
  copy,
}: {
  icon: typeof QrCode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  copy?: CheckoutCopy;
}) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={`relative flex h-[68px] min-w-0 flex-col items-center justify-center gap-2 rounded-sm border bg-white p-2 text-center ${
        active ? 'border-primary' : 'border-[#d0d5dd]'
      } ${disabled ? 'opacity-55' : ''}`}
    >
      <Icon className="size-6 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
      <span className="text-[11px] leading-4 font-medium text-[#333] sm:text-xs">{label}</span>
      {disabled ? (
        <span className="absolute top-1 right-1 text-[8px] leading-3 text-[#667085]">{copy?.soon}</span>
      ) : null}
    </div>
  );
}

function buildScheduleBadges(
  mode: string,
  start: string,
  end: string,
  qty: string,
  locale: 'vi' | 'en',
  tListing: ScopedI18n<NsI18n.Listing>['t'],
): string[] {
  if (mode !== 'hourly') return [scheduleLabel(mode, start, end, qty, locale, tListing)];
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [scheduleLabel(mode, start, end, qty, locale, tListing)];
  }
  const durationHours = Math.max(1, Math.round((endMs - startMs) / 3_600_000));
  if (durationHours > 6 || (endMs - startMs) % 3_600_000 !== 0) {
    return [`${timeInTz(start, DEFAULT_TZ)} - ${timeInTz(end, DEFAULT_TZ)} (${durationHours} ${locale === 'vi' ? 'giờ' : 'hours'})`];
  }
  return Array.from({ length: durationHours }, (_, index) => {
    const slotStart = new Date(startMs + index * 3_600_000).toISOString();
    const slotEnd = new Date(startMs + (index + 1) * 3_600_000).toISOString();
    return `${timeInTz(slotStart, DEFAULT_TZ)} - ${timeInTz(slotEnd, DEFAULT_TZ)} (1 ${locale === 'vi' ? 'giờ' : 'hour'})`;
  });
}

function scheduleLabel(
  mode: string,
  start: string,
  end: string,
  qty: string,
  locale: 'vi' | 'en',
  tListing: ScopedI18n<NsI18n.Listing>['t'],
): string {
  if (mode === 'daily') {
    return `${dateLabelInTz(start, DEFAULT_TZ, locale)} → ${dateLabelInTz(end, DEFAULT_TZ, locale)}`;
  }
  if (mode === 'inventory') {
    return `${dateLabelInTz(start, DEFAULT_TZ, locale)} → ${dateLabelInTz(end, DEFAULT_TZ, locale)} · ${tListing('quantity')}: ${qty}`;
  }
  return `${dateLabelInTz(start, DEFAULT_TZ, locale)} · ${timeInTz(start, DEFAULT_TZ)}–${timeInTz(end, DEFAULT_TZ)}`;
}

function friendlyFieldError(name: string, fallback?: string): string {
  if (name === 'email') return 'Vui lòng điền email hợp lệ';
  if (name === 'phone') return 'Vui lòng điền số điện thoại hợp lệ';
  if (name === 'fullName') return 'Vui lòng điền họ và tên';
  return fallback ?? 'Thông tin chưa hợp lệ';
}

function checkoutError(error: string, t: ScopedI18n<NsI18n.Checkout>['t']): string {
  if (error === 'SLOT_TAKEN' || error === 'SLOT_HELD') return t('invalidSlot');
  if (error === 'Không kết nối được máy chủ.') return error;
  return error;
}
