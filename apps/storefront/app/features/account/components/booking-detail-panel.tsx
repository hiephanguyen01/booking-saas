import type { CustomerBookingSettlementResponse, QuoteLineItem } from '@booking/contracts';
import { formatCurrency, formatDateTime, type Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Textarea } from '@booking/ui/components/ui/textarea';
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Info,
  MessageSquareText,
  PackageCheck,
  Star,
  Upload,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import type { AccountBookingViewModel } from '../lib/booking-history';
import { CancellationPolicyList, StudioThumbnail } from './account-primitives';
import { BookingStatusBadge } from './booking-status-badge';
import { CancelBookingDialog } from './cancel-booking-dialog';

export function BookingDetailPanel({
  booking,
  locale,
  defaultCancelOpen,
  actionError,
  settlement,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  defaultCancelOpen: boolean;
  actionError: string | null;
  settlement: CustomerBookingSettlementResponse | null;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const hasPostServiceRefund =
    settlement !== null &&
    settlement.kind !== 'cancellation_fee' &&
    (settlement.status === 'refund_pending' || BigInt(settlement.refundedAmount) > 0n);
  return (
    <div className="space-y-4">
      <Link
        to={storefrontPaths.account.bookings(locale)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" /> {t('bookings.title')}
      </Link>

      {actionError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t('bookings.actionFailed')}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_10px_35px_rgba(15,23,42,0.045)]">
        <OrderHeader booking={booking} locale={locale} />
        <BookingOverview
          booking={booking}
          locale={locale}
          defaultCancelOpen={defaultCancelOpen}
          actionError={actionError}
          postServiceRefund={hasPostServiceRefund}
        />
      </section>

      {booking.variant === 'completed' ? <ReviewSection booking={booking} /> : null}

      <ContactSection booking={booking} />

      {booking.variant === 'cancelled' ? (
        booking.status === 'refunded' &&
        settlement !== null &&
        settlement.kind !== 'cancellation_fee' ? (
          <PostServiceRefundSummary settlement={settlement} locale={locale} />
        ) : (
          <CancellationSummary booking={booking} locale={locale} settlement={settlement} />
        )
      ) : booking.variant === 'no-show' ? (
        <NoShowSummary booking={booking} locale={locale} />
      ) : (
        <PaymentSummary booking={booking} locale={locale} />
      )}

      {booking.variant !== 'cancelled' && hasPostServiceRefund && settlement ? (
        <PostServiceRefundSummary settlement={settlement} locale={locale} />
      ) : null}

      <PaymentTaxNote />
    </div>
  );
}

function PaymentTaxNote() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <p className="flex items-start gap-2 px-1 text-sm leading-6 text-foreground">
      <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {t('bookings.payment.taxNote')}
    </p>
  );
}

function OrderHeader({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <p className="truncate text-sm font-medium">{booking.partnerName}</p>
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
          <Link to={storefrontPaths.account.messages(locale)}>
            <MessageSquareText className="size-4" /> {t('bookings.chat')}
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <div className="min-w-0">
          <p className="sr-only">{t('bookings.order')}</p>
          <h1 className="font-mono font-medium tracking-tight text-foreground">{booking.code}</h1>
          <p className="mt-0.5 text-muted-foreground">
            {t('bookings.placedAt', {
              date: formatDateTime(booking.createdAt, locale, 'Asia/Ho_Chi_Minh'),
            })}
          </p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>
    </header>
  );
}

function BookingOverview({
  booking,
  locale,
  defaultCancelOpen,
  actionError,
  postServiceRefund,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  defaultCancelOpen: boolean;
  actionError: string | null;
  postServiceRefund: boolean;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const mode =
    booking.bookingMode === 'hourly' ||
    booking.bookingMode === 'daily' ||
    booking.bookingMode === 'inventory'
      ? booking.bookingMode
      : 'other';
  return (
    <div>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-[158px_minmax(0,1fr)] sm:px-6">
        {booking.imageUrl ? (
          <img
            src={booking.imageUrl}
            alt={booking.listingTitle}
            className="aspect-[4/3] w-full rounded-lg object-cover"
          />
        ) : (
          <StudioThumbnail
            label={booking.listingTitle}
            className="aspect-[4/3] w-full rounded-lg border border-border/70"
          />
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6">{booking.listingTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{booking.resourceName}</p>
          <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-muted-foreground">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="sr-only">{t('bookings.schedule')}: </span>
              {booking.dateLabel}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5">
              <Clock3 className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{t('bookings.timeAndDuration')}: </span>
              {booking.timeLabel}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1.5">{booking.durationLabel}</span>
          </div>
          {booking.listingDescription ? (
            <p className="mt-3 text-sm leading-5 text-muted-foreground">
              {booking.listingDescription}
            </p>
          ) : null}
          <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs">
            <BookingFact
              icon={PackageCheck}
              label={t('bookings.bookingType')}
              value={t(`bookings.modes.${mode}`)}
            />
            <BookingFact
              icon={booking.bookingMode === 'inventory' ? PackageCheck : Users}
              label={
                booking.bookingMode === 'inventory' ? t('bookings.quantity') : t('bookings.guests')
              }
              value={String(
                booking.bookingMode === 'inventory' ? booking.quantity : booking.guestCount,
              )}
            />
          </dl>
        </div>
      </div>

      {booking.attributes.length ? (
        <dl className="grid gap-3 border-t border-border/70 px-5 py-4 text-sm sm:grid-cols-2 sm:px-6">
          {booking.attributes.map((attribute) => (
            <div key={attribute.label} className="rounded-lg bg-muted/40 px-4 py-3">
              <dt className="text-xs text-muted-foreground">{attribute.label}</dt>
              <dd className="mt-1 font-medium">{attribute.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {hasBookingFooter(booking, postServiceRefund) ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/70 bg-muted/15 px-5 py-4 sm:px-6">
          <PolicyNotes booking={booking} locale={locale} postServiceRefund={postServiceRefund} />
          <div className="flex flex-wrap gap-2">
            {booking.variant === 'payment' && booking.status === 'pending_payment' ? (
              <Form method="post">
                <input type="hidden" name="intent" value="pay" />
                <Button className="h-10 rounded-lg">{t('bookings.payNow')}</Button>
              </Form>
            ) : null}
            {booking.status === 'confirmed' ? (
              <CancelBookingDialog
                booking={booking}
                locale={locale}
                defaultOpen={defaultCancelOpen}
                serverError={actionError}
              />
            ) : null}
            {booking.variant === 'no-show' ? (
              <Button asChild variant="outline" className="h-10 rounded-lg">
                <Link to={storefrontPaths.account.help(locale)}>{t('bookings.dispute')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function hasBookingFooter(booking: AccountBookingViewModel, postServiceRefund: boolean): boolean {
  if (postServiceRefund) return false;
  if (booking.variant === 'cancelled' || booking.variant === 'no-show') return true;
  if (booking.variant === 'payment' && booking.status === 'pending_payment') return true;
  if (booking.status === 'confirmed') return true;
  return booking.cancellationTiers.length > 0 && booking.variant !== 'completed';
}

function BookingFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function PolicyNotes({
  booking,
  locale,
  postServiceRefund,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  postServiceRefund: boolean;
}) {
  const { t } = useTranslation(NsI18n.Account);
  if (postServiceRefund) return null;
  if (booking.variant === 'cancelled') {
    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('bookings.refundPreview', { percent: booking.refundPercent ?? 0 })}</p>
        <p>{t('bookings.refundTiming')}</p>
      </div>
    );
  }
  if (booking.variant === 'no-show') {
    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('bookings.noRefund')}</p>
        <p>{t('bookings.disputeHint')}</p>
      </div>
    );
  }
  if (!booking.cancellationTiers.length || booking.variant === 'completed') return null;
  return <CancellationPolicyList booking={booking} locale={locale} />;
}

function ContactSection({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.contact.title')}>
      <DetailRow label={t('bookings.contact.customer')} value={booking.customer.fullName} />
      <DetailRow label={t('bookings.contact.phone')} value={booking.customer.phone ?? '-'} />
      <DetailRow label={t('bookings.contact.email')} value={booking.customer.email} />
      <DetailRow label={t('bookings.contact.note')} value={booking.customerNote ?? '-'} />
    </DetailSection>
  );
}

function PaymentSummary({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  const depositLabel =
    booking.variant === 'completed'
      ? t('bookings.payment.deposit')
      : t('bookings.payment.depositDue');
  return (
    <DetailSection
      title={t('bookings.payment.title')}
      footer={
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-muted px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t('bookings.payment.balance')}</span>
          <span className="font-semibold">{money(booking.balanceAmount, locale)}</span>
        </div>
      }
    >
      {booking.pricingLineItems.length ? (
        booking.pricingLineItems.map((line) => (
          <PricingLineRow
            key={`${line.label}-${line.quantity}-${line.amount}`}
            line={line}
            locale={locale}
          />
        ))
      ) : (
        <DetailRow
          label={t('bookings.payment.original')}
          value={money(booking.totalAmount, locale)}
        />
      )}
      {BigInt(booking.discountAmount) > 0n ? (
        <DetailRow
          label={t('bookings.payment.discount')}
          value={`- ${money(booking.discountAmount, locale)}`}
        />
      ) : null}
      <DetailRow label={t('bookings.payment.total')} value={money(booking.finalAmount, locale)} />
      <DetailRow label={depositLabel} value={money(booking.depositAmount, locale)} accent />
      {BigInt(booking.securityDeposit) > 0n ? (
        <DetailRow
          label={t('bookings.payment.securityDeposit')}
          value={money(booking.securityDeposit, locale)}
        />
      ) : null}
    </DetailSection>
  );
}

function PricingLineRow({ line, locale }: { line: QuoteLineItem; locale: Locale }) {
  const hasDiscount = BigInt(line.regularAmount) > BigInt(line.amount);
  const percentOff = hasDiscount
    ? Math.round((1 - Number(line.amount) / Number(line.regularAmount)) * 100)
    : 0;
  return (
    <div className="grid gap-1 py-3 text-sm first:pt-0 last:pb-0 sm:grid-cols-[minmax(9rem,0.4fr)_minmax(0,0.6fr)] sm:gap-6">
      <dt className="text-muted-foreground">{`${line.label} × ${line.quantity}`}</dt>
      <dd className="break-words sm:text-right">
        {hasDiscount ? (
          <span className="mr-2 inline-flex items-center gap-1.5">
            <span className="rounded bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white">
              -{percentOff}%
            </span>
            <span className="text-xs text-muted-foreground line-through">
              {money(line.regularAmount, locale)}
            </span>
          </span>
        ) : null}
        {money(line.amount, locale)}
      </dd>
    </div>
  );
}

function CancellationSummary({
  booking,
  locale,
  settlement,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  settlement: CustomerBookingSettlementResponse | null;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const refunded = settlement ? BigInt(settlement.refundedAmount) : 0n;
  const refundAmount = booking.refundAmount ?? (refunded > 0n ? settlement?.refundedAmount : null);
  const serviceRefundAmount = refundAmount
    ? maxMoney(BigInt(refundAmount) - BigInt(booking.securityDeposit))
    : 0n;
  const noRefundDue =
    refundAmount === '0' && settlement?.status === 'dispute_window' && !settlement.refundConfirmed;
  const refundStatus =
    settlement?.status === 'refund_pending'
      ? t('bookings.refund.pending')
      : noRefundDue
        ? t('bookings.refund.noRefundDue')
        : refunded > 0n && settlement?.status === 'dispute_window'
          ? t('bookings.refund.partialCompleted')
          : refunded > 0n || settlement?.status === 'refunded' || settlement?.refundConfirmed
            ? t('bookings.refund.completed')
            : t('bookings.refund.pending');
  return (
    <DetailSection title={t('bookings.refund.title')}>
      {booking.cancelledAt ? (
        <DetailRow
          label={t('bookings.refund.cancelledAt')}
          value={formatDateTime(booking.cancelledAt, locale, 'Asia/Ho_Chi_Minh')}
        />
      ) : null}
      {booking.cancellationReason ? (
        <DetailRow label={t('bookings.refund.reason')} value={booking.cancellationReason} />
      ) : null}
      <DetailRow label={t('bookings.payment.deposit')} value={money(booking.paidAmount, locale)} />
      {BigInt(booking.securityDeposit) > 0n ? (
        <DetailRow
          label={t('bookings.payment.securityDeposit')}
          value={money(booking.securityDeposit, locale)}
        />
      ) : null}
      {refundAmount ? (
        <DetailRow
          label={t('bookings.refund.fee')}
          value={money(
            String(
              BigInt(booking.paidAmount) > serviceRefundAmount
                ? BigInt(booking.paidAmount) - serviceRefundAmount
                : 0n,
            ),
            locale,
          )}
        />
      ) : null}
      <DetailRow label={t('bookings.refund.amount')} value={money(refundAmount ?? '0', locale)} />
      <DetailRow label={t('bookings.refund.status')} value={refundStatus} strong />
    </DetailSection>
  );
}

function PostServiceRefundSummary({
  settlement,
  locale,
}: {
  settlement: CustomerBookingSettlementResponse;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection
      title={t('bookings.refund.serviceTitle')}
      footer={
        <p className="mt-4 text-xs text-muted-foreground">{t('bookings.refund.serviceNote')}</p>
      }
    >
      <DetailRow
        label={t('bookings.refund.amount')}
        value={money(settlement.refundedAmount, locale)}
      />
      <DetailRow
        label={t('bookings.refund.status')}
        value={
          settlement.status === 'refund_pending'
            ? t('bookings.refund.pending')
            : t('bookings.refund.completed')
        }
        strong
      />
    </DetailSection>
  );
}

function maxMoney(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

function NoShowSummary({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.noShow.title')}>
      <DetailRow label={t('bookings.payment.deposit')} value={money(booking.paidAmount, locale)} />
      <DetailRow label={t('bookings.noShow.fee')} value={money(booking.paidAmount, locale)} />
      <DetailRow label={t('bookings.refund.amount')} value={money('0', locale)} />
      {BigInt(booking.securityDeposit) > 0n ? (
        <DetailRow
          label={t('bookings.noShow.securityRefund')}
          value={money(booking.securityDeposit, locale)}
        />
      ) : null}
    </DetailSection>
  );
}

function ReviewSection({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  const review = booking.review;
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [submitted, setSubmitted] = useState(review?.state === 'reviewed');

  return (
    <section className="rounded-xl border border-border/70 bg-background px-5 py-6 shadow-[0_10px_35px_rgba(15,23,42,0.035)] sm:px-6">
      <h2 className="text-base font-semibold">{t('bookings.reviewSection.title')}</h2>
      {submitted ? (
        <div className="mt-5">
          <div className="flex gap-1 text-amber-500">
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className="size-4"
                fill={value <= rating ? 'currentColor' : 'none'}
              />
            ))}
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {review?.body ?? t('bookings.reviewSection.saved')}
          </p>
          {review?.photos?.length ? (
            <div className="mt-4 flex gap-2">
              {review.photos.map((photo) => (
                <img key={photo} src={photo} alt="" className="size-20 rounded-lg object-cover" />
              ))}
            </div>
          ) : null}
          {review?.response ? (
            <div className="mt-4 rounded-lg bg-muted/60 p-4 text-xs leading-5">
              <p className="font-semibold">{booking.partnerName}</p>
              <p className="mt-1 text-muted-foreground">{review.response}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 text-amber-500">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${value}/5`}
                >
                  <Star className="size-5" fill={value <= rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={rating === 0}
              onClick={() => setSubmitted(true)}
            >
              {t('bookings.reviewSection.submit')}
            </Button>
          </div>
          <Textarea placeholder={t('bookings.reviewSection.placeholder')} className="rounded-lg" />
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-primary/50 p-8 text-center">
            <Upload className="size-8 text-primary" aria-hidden="true" />
            <p className="text-sm font-medium">{t('bookings.reviewSection.uploadHint')}</p>
            <div className="flex w-full max-w-50 items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">
                {t('bookings.reviewSection.uploadOr')}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" size="sm">
              {t('bookings.reviewSection.chooseFiles')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailSection({
  title,
  children,
  lead,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  lead?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-background px-5 py-6 shadow-[0_10px_35px_rgba(15,23,42,0.035)] sm:px-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {lead}
      <dl className="divide-y divide-border/70">{children}</dl>
      {footer}
    </section>
  );
}

function DetailRow({
  label,
  value,
  accent = false,
  strong = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`grid gap-1 py-3 text-sm first:pt-0 last:pb-0 sm:grid-cols-[minmax(9rem,0.4fr)_minmax(0,0.6fr)] sm:gap-6 ${strong ? 'rounded-lg bg-muted/45 px-3 first:pt-3 last:pb-3' : ''}`}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`break-words sm:text-right ${accent ? 'font-semibold text-destructive' : ''} ${strong ? 'font-semibold' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function money(value: string, locale: Locale): string {
  return formatCurrency(BigInt(value), 'VND', locale);
}
