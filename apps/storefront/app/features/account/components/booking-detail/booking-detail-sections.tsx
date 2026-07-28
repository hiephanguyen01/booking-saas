import type { CustomerBookingSettlementResponse, QuoteLineItem } from '@booking/contracts';
import { formatCurrency, formatDateTime, type Locale } from '@booking/i18n';
import { ReviewMediaGallery } from '@booking/ui/components/review/review-media-gallery';
import { Button } from '@booking/ui/components/ui/button';
import { Info, Star } from 'lucide-react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import {
  bookingDetailState,
  type AccountBookingViewModel,
} from '~/features/account/lib/booking-history';

export function BookingContactSection({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.contact.title')}>
      <DetailRows>
        <DetailRow
          label={t('bookings.contact.customer')}
          value={booking.customer.fullName}
          align="start"
        />
        <DetailRow
          label={t('bookings.contact.phone')}
          value={booking.customer.phone ?? '-'}
          align="start"
        />
        <DetailRow
          label={t('bookings.contact.email')}
          value={booking.customer.email}
          align="start"
        />
        <DetailRow
          label={t('bookings.contact.note')}
          value={booking.customerNote ?? '-'}
          align="start"
        />
      </DetailRows>
    </DetailSection>
  );
}

export function BookingFinancialSection({
  booking,
  locale,
  settlement,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  settlement: CustomerBookingSettlementResponse | null;
}) {
  const state = bookingDetailState(booking.status);
  const hasPostServiceRefund =
    settlement !== null &&
    settlement.kind !== 'cancellation_fee' &&
    (settlement.status === 'refund_pending' || BigInt(settlement.refundedAmount) > 0n);

  if (state === 'absent') return <NoShowSummary booking={booking} locale={locale} />;
  if (state === 'cancelled') {
    return booking.status === 'refunded' && hasPostServiceRefund && settlement ? (
      <PostServiceRefundSummary settlement={settlement} locale={locale} />
    ) : (
      <CancellationSummary booking={booking} locale={locale} settlement={settlement} />
    );
  }

  return (
    <>
      <PaymentSummary booking={booking} locale={locale} />
      {hasPostServiceRefund && settlement ? (
        <PostServiceRefundSummary settlement={settlement} locale={locale} />
      ) : null}
    </>
  );
}

export function PaymentTaxNote({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  const state = bookingDetailState(booking.status);
  if (state === 'absent') return null;
  return (
    <p className="flex items-start gap-2 px-0.5 text-xs leading-5 text-[#4d5a70]">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#263247]" />
      {state === 'cancelled'
        ? t('bookings.refund.policyNote', { percent: booking.refundPercent ?? 0 })
        : t('bookings.payment.taxNote')}
    </p>
  );
}

export function BookingReviewSection({
  booking,
  onReview,
}: {
  booking: AccountBookingViewModel;
  onReview: () => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const viewerLabels = useMediaViewerLabels();
  const review = booking.review;

  return (
    <DetailSection title={t('bookings.reviewSection.title')}>
      {review?.status === 'reviewed' ? (
        <div className="text-xs leading-5 text-[#4d5a70]">
          <div className="flex gap-1 text-amber-500" aria-label={`${review.rating}/5`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className="size-4"
                fill={value <= review.rating ? 'currentColor' : 'none'}
              />
            ))}
          </div>
          <p className="mt-3">{review.content}</p>
          <ReviewMediaGallery
            items={review.media}
            className="mt-3"
            viewLabel={t('reviews.mediaView')}
            viewerTitle={t('reviews.mediaViewerTitle')}
            viewerLabels={viewerLabels}
          />
          {review.reply ? (
            <div className="mt-4 bg-[#f1f3f7] p-4">
              <p className="font-semibold text-[#263247]">{review.reply.partnerName}</p>
              <p className="mt-1">{review.reply.content}</p>
            </div>
          ) : null}
        </div>
      ) : review?.status === 'pending' ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#263247]">{t('reviews.invitation')}</p>
            <p className="mt-1 text-xs leading-5 text-[#4d5a70]">
              {t('reviews.dialog.description', { title: booking.listingTitle })}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onReview}
            className="h-9 shrink-0 rounded-sm bg-[#ff3f44] px-5 text-xs text-white"
          >
            {t('bookings.reviewSection.submit')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-[#4d5a70]">
            {t('bookings.reviewSection.unavailable')}
          </p>
          <Button type="button" size="sm" disabled className="h-9 rounded-sm px-5 text-xs">
            {t('bookings.reviewSection.submit')}
          </Button>
        </div>
      )}
    </DetailSection>
  );
}

function PaymentSummary({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  const depositLabel =
    booking.status === 'completed'
      ? t('bookings.payment.deposit')
      : t('bookings.payment.depositDue');

  return (
    <DetailSection title={t('bookings.payment.title')}>
      <DetailRows>
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
      </DetailRows>
      {booking.status !== 'pending_payment' ? (
        <div className="mt-0 grid min-h-12 items-center border border-[#d8dee8] bg-[#f1f3f7] px-4 text-sm sm:grid-cols-2">
          <span className="text-[#667085] sm:text-right">{t('bookings.payment.balance')}</span>
          <span className="font-semibold text-[#263247] sm:text-right">
            {money(booking.balanceAmount, locale)}
          </span>
        </div>
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
    <div className="grid min-h-12 items-center gap-1 border-b border-[#d8dee8] py-2 text-sm last:border-b-0 sm:grid-cols-2">
      <dt className="text-[#667085] sm:text-right">{`${line.label} × ${line.quantity}`}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-2 text-[#263247]">
        {hasDiscount ? (
          <>
            <span className="bg-[#ff5b60] px-2 py-0.5 text-[11px] font-semibold text-white">
              -{percentOff}%
            </span>
            <span className="text-[11px] text-[#667085] line-through">
              {money(line.regularAmount, locale)}
            </span>
          </>
        ) : null}
        <span>{money(line.amount, locale)}</span>
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
  const refundAmount =
    booking.refundAmount ?? (refunded > 0n && settlement ? settlement.refundedAmount : '0');
  const serviceRefundAmount = maxMoney(BigInt(refundAmount) - BigInt(booking.securityDeposit));
  const cancellationFee = maxMoney(BigInt(booking.paidAmount) - serviceRefundAmount);
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
      <DetailRows>
        {booking.cancelledAt ? (
          <DetailRow
            label={t('bookings.refund.cancelledAt')}
            value={formatDateTime(booking.cancelledAt, locale, 'Asia/Ho_Chi_Minh')}
          />
        ) : null}
        {booking.cancellationReason ? (
          <DetailRow label={t('bookings.refund.reason')} value={booking.cancellationReason} />
        ) : null}
        <DetailRow
          label={t('bookings.payment.deposit')}
          value={money(booking.paidAmount, locale)}
        />
        <DetailRow
          label={t('bookings.refund.fee')}
          value={money(String(cancellationFee), locale)}
        />
        <DetailRow label={t('bookings.refund.amount')} value={money(refundAmount, locale)} />
      </DetailRows>
      <SummaryFooter value={refundStatus} />
    </DetailSection>
  );
}

function NoShowSummary({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <DetailSection title={t('bookings.noShow.title')}>
      <DetailRows>
        <DetailRow
          label={t('bookings.payment.deposit')}
          value={money(booking.paidAmount, locale)}
        />
        <DetailRow label={t('bookings.noShow.fee')} value={money(booking.paidAmount, locale)} />
        <DetailRow label={t('bookings.refund.amount')} value={money('0', locale)} />
        {BigInt(booking.securityDeposit) > 0n ? (
          <DetailRow
            label={t('bookings.noShow.securityRefund')}
            value={money(booking.securityDeposit, locale)}
          />
        ) : null}
      </DetailRows>
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
  const status =
    settlement.status === 'refund_pending'
      ? t('bookings.refund.pending')
      : t('bookings.refund.completed');
  return (
    <DetailSection title={t('bookings.refund.serviceTitle')}>
      <DetailRows>
        <DetailRow
          label={t('bookings.refund.amount')}
          value={money(settlement.refundedAmount, locale)}
        />
      </DetailRows>
      <SummaryFooter value={status} />
      <p className="mt-3 text-xs text-muted-foreground">{t('bookings.refund.serviceNote')}</p>
    </DetailSection>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-background px-5 py-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:px-6">
      <h2 className="text-base font-semibold text-[#263247]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailRows({ children }: { children: React.ReactNode }) {
  return <dl>{children}</dl>;
}

function DetailRow({
  label,
  value,
  accent = false,
  align = 'end',
}: {
  label: string;
  value: string;
  accent?: boolean;
  align?: 'start' | 'end';
}) {
  const alignmentClass =
    align === 'start' ? 'sm:grid-cols-[160px_minmax(0,1fr)]' : 'sm:grid-cols-2 sm:text-right';
  return (
    <div
      className={`grid min-h-12 items-center gap-1 border-b border-[#d8dee8] py-2 text-sm last:border-b-0 ${alignmentClass}`}
    >
      <dt className="text-[#667085]">{label}</dt>
      <dd className={`break-words text-[#263247] ${accent ? 'font-semibold text-[#ff3f44]' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function SummaryFooter({ value }: { value: string }) {
  return (
    <div className="mt-0 flex min-h-12 items-center justify-end border border-[#d8dee8] bg-[#f1f3f7] px-4 text-sm font-semibold text-[#263247]">
      {value}
    </div>
  );
}

function maxMoney(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

function money(value: string, locale: Locale): string {
  return formatCurrency(BigInt(value), 'VND', locale);
}
