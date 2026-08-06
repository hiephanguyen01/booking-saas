import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import { formatCurrency, formatDateTime, type Locale } from '@booking/i18n';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '@booking/i18n';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { DEFAULT_TZ } from '~/lib/time';

type CustomerDispute = NonNullable<CustomerBookingSettlementResponse['dispute']>;

const STATUS_KEYS = {
  open: 'bookings.disputeSection.statusOpen',
  accepted: 'bookings.disputeSection.statusAccepted',
  rejected: 'bookings.disputeSection.statusRejected',
  resolved: 'bookings.disputeSection.statusResolved',
} as const;

const STATUS_VARIANTS = {
  open: 'secondary',
  accepted: 'success',
  rejected: 'destructive',
  resolved: 'outline',
} as const;

const RESOLUTION_KEYS = {
  release: 'bookings.disputeSection.resolutionRelease',
  full_refund: 'bookings.disputeSection.resolutionFullRefund',
  partial_refund: 'bookings.disputeSection.resolutionPartialRefund',
} as const;

/**
 * The customer's own view of a dispute they opened. The customer-safe
 * projection deliberately omits the reason and evidence they submitted, so this
 * section reports progress and outcome only.
 */
export function BookingDisputeSection({
  dispute,
  locale,
}: {
  dispute: CustomerDispute;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const refundAmount = BigInt(dispute.refundAmount);

  return (
    <section className={cn(PANEL_SURFACE, 'p-(--sf-surface-pad)')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">
          {t('bookings.disputeSection.title')}
        </h2>
        <Badge variant={STATUS_VARIANTS[dispute.status]}>{t(STATUS_KEYS[dispute.status])}</Badge>
      </div>

      <dl className="mt-4 space-y-3 text-sm leading-6">
        <DisputeRow
          label={t('bookings.disputeSection.openedAt')}
          value={formatDateTime(dispute.createdAt, locale, DEFAULT_TZ)}
        />
        <DisputeRow
          label={t('bookings.disputeSection.partnerResponse')}
          value={dispute.partnerResponse ?? t('bookings.disputeSection.awaitingResponse')}
        />
        {dispute.partnerRespondedAt ? (
          <DisputeRow
            label={t('bookings.disputeSection.partnerRespondedAt')}
            value={formatDateTime(dispute.partnerRespondedAt, locale, DEFAULT_TZ)}
          />
        ) : null}
        {dispute.resolution ? (
          <DisputeRow
            label={t('bookings.disputeSection.resolution')}
            value={t(RESOLUTION_KEYS[dispute.resolution])}
          />
        ) : null}
        {dispute.resolutionNote ? (
          <DisputeRow
            label={t('bookings.disputeSection.resolutionNote')}
            value={dispute.resolutionNote}
          />
        ) : null}
        {refundAmount > 0n ? (
          <DisputeRow
            label={t('bookings.disputeSection.refundAmount')}
            value={formatCurrency(refundAmount, 'VND', locale)}
          />
        ) : null}
        {dispute.resolvedAt ? (
          <DisputeRow
            label={t('bookings.disputeSection.resolvedAt')}
            value={formatDateTime(dispute.resolvedAt, locale, DEFAULT_TZ)}
          />
        ) : null}
      </dl>

      {dispute.status === 'open' ? (
        <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          {t('bookings.disputeSection.openNote')}
        </p>
      ) : null}
    </section>
  );
}

function DisputeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 max-w-full break-words text-right font-medium text-foreground sm:max-w-[60%]">
        {value}
      </dd>
    </div>
  );
}
