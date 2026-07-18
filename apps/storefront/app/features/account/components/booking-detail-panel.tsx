import { formatCurrency, type Locale } from '@booking/i18n';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Textarea } from '@booking/ui/components/ui/textarea';
import {
  AirVent,
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  CircleAlert,
  ImagePlus,
  MessageSquareText,
  Refrigerator,
  Shirt,
  Snowflake,
  Sparkles,
  Star,
  Warehouse,
  Wind,
} from 'lucide-react';
import { useState } from 'react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import type { AccountBookingViewModel } from '../lib/booking-history';
import { CancelBookingDialog } from './cancel-booking-dialog';

export function BookingDetailPanel({
  booking,
  locale,
  defaultCancelOpen,
  actionError,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  defaultCancelOpen: boolean;
  actionError: string | null;
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="space-y-3">
      <h1 className="min-h-8 text-lg font-semibold uppercase tracking-wide">
        {t('bookings.title')}
      </h1>
      <Link
        to={storefrontPaths.account.bookings(locale)}
        className="flex min-h-12 items-center gap-2 bg-background px-5 text-sm font-medium shadow-[0_6px_20px_rgba(15,23,42,0.035)] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" /> {t('bookings.detailTitle')}
      </Link>
      {actionError ? (
        <p role="alert" className="bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('bookings.actionFailed')}
        </p>
      ) : null}

      <BookingOverview
        booking={booking}
        locale={locale}
        defaultCancelOpen={defaultCancelOpen}
        actionError={actionError}
      />

      {booking.variant === 'completed' && booking.review ? (
        <ReviewSection booking={booking} />
      ) : null}

      <ContactSection booking={booking} />

      {booking.variant === 'cancelled' ? (
        <CancellationSummary booking={booking} locale={locale} />
      ) : booking.variant === 'no-show' ? (
        <NoShowSummary booking={booking} locale={locale} />
      ) : (
        <PaymentSummary booking={booking} locale={locale} />
      )}
    </div>
  );
}

function BookingOverview({
  booking,
  locale,
  defaultCancelOpen,
  actionError,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  defaultCancelOpen: boolean;
  actionError: string | null;
}) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Booking]);
  return (
    <section className="bg-background px-5 py-5 shadow-[0_7px_24px_rgba(15,23,42,0.04)] sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">{booking.studioName}</span>
          <Button asChild variant="outline" size="sm" className="h-8 rounded-sm px-3 text-primary">
            <Link to={storefrontPaths.account.messages(locale)}>
              <MessageSquareText className="size-3.5" /> {t('account:bookings.chat')}
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2 font-medium">
          <span>
            {t('booking:code')} {booking.code}
          </span>
          <span className="h-4 w-px bg-border" />
          <span className="text-destructive">{t(`booking:statusLabels.${booking.status}`)}</span>
        </div>
      </div>

      <div className="grid gap-5 border-b border-border py-5 sm:grid-cols-[158px_minmax(0,1fr)]">
        <img
          src={booking.imageUrl}
          alt=""
          className="h-32 w-full rounded-sm object-cover sm:h-28"
        />
        <div>
          <p className="text-sm font-semibold">{booking.listingTitle}</p>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-4" /> {booking.dateLabel}
          </p>
          <Badge variant="secondary" className="mt-3 rounded-sm font-normal">
            {booking.timeLabel} ({booking.durationLabel})
          </Badge>
        </div>
      </div>

      {booking.attributes.length ? (
        <dl className="grid gap-2 border-b border-border py-5 text-xs">
          {booking.attributes.map((attribute) => (
            <div key={attribute.label} className="grid gap-1 sm:grid-cols-[110px_1fr]">
              <dt className="font-semibold">{attribute.label}:</dt>
              <dd className="text-muted-foreground">{attribute.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {booking.amenities.length ? (
        <div className="border-b border-border py-5">
          <h2 className="text-sm font-semibold">{t('account:bookings.amenities')}</h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-xs text-muted-foreground">
            {booking.amenities.map((amenity, index) => {
              const Icon = AMENITY_ICONS[index % AMENITY_ICONS.length];
              return (
                <span key={amenity} className="flex items-center gap-2">
                  <Icon className="size-4" /> {amenity}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {booking.description ? (
        <p className="border-b border-border py-4 text-xs leading-5 text-muted-foreground">
          {booking.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4 pt-4">
        <PolicyNotes booking={booking} />
        {booking.variant === 'payment' && booking.status === 'pending_payment' ? (
          <Form method="post">
            <input type="hidden" name="intent" value="pay" />
            <Button className="h-10 rounded-sm">{t('account:bookings.payNow')}</Button>
          </Form>
        ) : null}
        {booking.status === 'confirmed' ? (
          <CancelBookingDialog defaultOpen={defaultCancelOpen} serverError={actionError} />
        ) : null}
        {booking.variant === 'no-show' ? (
          <Button asChild variant="outline" className="h-10 rounded-sm">
            <Link to={storefrontPaths.account.help(locale)}>{t('account:bookings.dispute')}</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

const AMENITY_ICONS = [AirVent, Wind, Snowflake, Refrigerator, Warehouse, Sparkles, Shirt, Camera];

function PolicyNotes({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  if (booking.variant === 'cancelled') {
    return (
      <ul className="space-y-2 text-xs text-muted-foreground">
        <li>· {t('bookings.refundPreview')}</li>
        <li>· {t('bookings.refundTiming')}</li>
      </ul>
    );
  }
  if (booking.variant === 'no-show') {
    return (
      <ul className="space-y-2 text-xs text-muted-foreground">
        <li>· {t('bookings.noRefund')}</li>
        <li>· {t('bookings.disputeHint')}</li>
      </ul>
    );
  }
  if (!booking.cancellationTiers.length || booking.variant === 'completed') return null;
  return (
    <div className="space-y-2 text-xs">
      <p className="flex items-center gap-2 text-emerald-600">
        <Check className="size-3.5" /> {t('bookings.freeCancellation')}
      </p>
      <p className="flex items-center gap-2 text-muted-foreground">
        <Check className="size-3.5 text-emerald-600" />
        {t('bookings.lateCancellation', {
          percent: booking.cancellationTiers.at(-1)?.refundPercent ?? 0,
        })}
      </p>
    </div>
  );
}

function ContactSection({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.contact.title')}>
      <DetailRow label={t('bookings.contact.customer')} value={booking.customer.fullName} />
      <DetailRow label={t('bookings.contact.phone')} value={booking.customer.phone ?? '—'} />
      <DetailRow label={t('bookings.contact.email')} value={booking.customer.email} />
      <DetailRow label={t('bookings.contact.note')} value={booking.customerNote ?? '—'} />
    </DetailSection>
  );
}

function PaymentSummary({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.payment.title')}>
      <DetailRow
        label={t('bookings.payment.original')}
        value={money(booking.totalAmount, locale)}
      />
      <DetailRow
        label={t('bookings.payment.discount')}
        value={`− ${money(booking.discountAmount, locale)}`}
      />
      <DetailRow label={t('bookings.payment.total')} value={money(booking.finalAmount, locale)} />
      <DetailRow
        label={t('bookings.payment.deposit')}
        value={money(booking.depositAmount, locale)}
        accent
      />
      {booking.paymentMethod ? (
        <DetailRow label={t('bookings.payment.method')} value={booking.paymentMethod} />
      ) : null}
      <DetailRow
        label={t('bookings.payment.balance')}
        value={money(booking.balanceAmount, locale)}
        strong
      />
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <CircleAlert className="size-4" /> {t('bookings.payment.taxNote')}
      </p>
    </DetailSection>
  );
}

function CancellationSummary({
  booking,
  locale,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.refund.title')}>
      {booking.cancelledAt ? (
        <DetailRow
          label={t('bookings.refund.cancelledAt')}
          value={new Date(booking.cancelledAt).toLocaleString(locale)}
        />
      ) : null}
      {booking.cancellationReason ? (
        <DetailRow label={t('bookings.refund.reason')} value={booking.cancellationReason} />
      ) : null}
      <DetailRow label={t('bookings.payment.deposit')} value={money(booking.paidAmount, locale)} />
      {booking.refundAmount ? (
        <DetailRow
          label={t('bookings.refund.fee')}
          value={money(String(BigInt(booking.paidAmount) - BigInt(booking.refundAmount)), locale)}
        />
      ) : null}
      <DetailRow
        label={t('bookings.refund.amount')}
        value={money(booking.refundAmount ?? '0', locale)}
      />
      <DetailRow label={t('bookings.refund.status')} value={t('bookings.refund.pending')} strong />
    </DetailSection>
  );
}

function NoShowSummary({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.noShow.title')}>
      <DetailRow label={t('bookings.payment.deposit')} value={money(booking.paidAmount, locale)} />
      <DetailRow label={t('bookings.noShow.fee')} value={money(booking.paidAmount, locale)} />
      <DetailRow label={t('bookings.refund.amount')} value={money('0', locale)} />
    </DetailSection>
  );
}

function ReviewSection({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  const [rating, setRating] = useState(booking.review?.rating ?? 0);
  const [submitted, setSubmitted] = useState(booking.review?.state === 'reviewed');
  if (!booking.review) return null;

  return (
    <section className="bg-background px-5 py-5 shadow-[0_7px_24px_rgba(15,23,42,0.04)] sm:px-6">
      <h2 className="text-base font-semibold">{t('bookings.reviewSection.title')}</h2>
      {submitted ? (
        <div className="mt-5">
          <div className="flex gap-1 text-amber-500">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className="size-4"
                fill={index < rating ? 'currentColor' : 'none'}
              />
            ))}
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {booking.review.body ?? t('bookings.reviewSection.saved')}
          </p>
          {booking.review.photos?.length ? (
            <div className="mt-4 flex gap-2">
              {booking.review.photos.map((photo) => (
                <img key={photo} src={photo} alt="" className="size-20 rounded-sm object-cover" />
              ))}
            </div>
          ) : null}
          {booking.review.response ? (
            <div className="mt-4 rounded-sm bg-muted/60 p-4 text-xs leading-5">
              <p className="font-semibold">{booking.studioName}</p>
              <p className="mt-1 text-muted-foreground">{booking.review.response}</p>
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
                  className="rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <Textarea placeholder={t('bookings.reviewSection.placeholder')} className="rounded-sm" />
          <div className="grid min-h-36 place-items-center rounded-sm border border-dashed border-primary/50 p-5 text-center text-xs text-muted-foreground">
            <div>
              <ImagePlus className="mx-auto mb-2 size-7 text-primary" />
              {t('bookings.reviewSection.upload')}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-background px-5 py-5 shadow-[0_7px_24px_rgba(15,23,42,0.04)] sm:px-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <dl>{children}</dl>
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
      className={`grid gap-1 border-b border-border py-3 text-sm last:border-b-0 sm:grid-cols-[190px_1fr] ${strong ? 'bg-muted/45 px-3' : ''}`}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`sm:text-right ${accent ? 'font-semibold text-destructive' : ''} ${strong ? 'font-semibold' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function money(value: string, locale: Locale): string {
  return formatCurrency(Number(value), 'VND', locale);
}
