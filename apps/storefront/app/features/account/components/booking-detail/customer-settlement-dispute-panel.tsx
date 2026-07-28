import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { CircleAlert, Clock3, Scale } from 'lucide-react';
import { Form } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useCustomerSettlementDisputePanelController } from '~/features/account/hooks/use-customer-settlement-dispute-panel-controller';

export function CustomerSettlementDisputePanel({
  settlement,
  locale,
}: {
  settlement: CustomerBookingSettlementResponse | null;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const model = useCustomerSettlementDisputePanelController({ settlement, locale });
  if (!model) return null;

  const {
    settlement: currentSettlement,
    canOpen,
    handleSubmit,
    submitting,
    heldAmount,
    deadlineLabel,
    refundAmount,
    showDisputedFallback,
  } = model;

  return (
    <section className="rounded-xl border border-border/70 bg-background px-5 py-5 shadow-[0_10px_35px_rgba(15,23,42,0.045)] sm:px-6">
      <div className="flex items-start gap-3">
        <Scale className="mt-0.5 size-5 text-primary" />
        <div>
          <h2 className="font-semibold">{t('bookings.disputePanel.title')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t(`bookings.disputePanel.status.${currentSettlement.status}`)}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t('bookings.disputePanel.held')}</dt>
          <dd className="mt-1 font-semibold">{heldAmount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('bookings.disputePanel.deadline')}</dt>
          <dd className="mt-1 font-medium">{deadlineLabel}</dd>
        </div>
      </dl>

      {canOpen ? (
        <Form
          method="post"
          className="mt-5 space-y-3 border-t border-border pt-5"
          onSubmit={handleSubmit}
          aria-busy={submitting}
        >
          <input type="hidden" name="intent" value="dispute" />
          <label htmlFor="dispute-reason" className="text-sm font-medium">
            {t('bookings.disputePanel.reason')}
          </label>
          <Textarea
            id="dispute-reason"
            name="reason"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            placeholder={t('bookings.disputePanel.reasonPlaceholder')}
            className="rounded-lg"
            disabled={submitting}
          />
          <label htmlFor="dispute-evidence" className="text-sm font-medium">
            {t('bookings.disputePanel.evidence')}
          </label>
          <Textarea
            id="dispute-evidence"
            name="evidence"
            maxLength={5000}
            rows={2}
            placeholder={t('bookings.disputePanel.evidencePlaceholder')}
            className="rounded-lg"
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="size-4" /> {t('bookings.disputePanel.lockHint')}
            </p>
            <Button type="submit" className="shrink-0 rounded-lg" disabled={submitting}>
              {submitting
                ? t('bookings.disputePanel.submitting')
                : t('bookings.disputePanel.submit')}
            </Button>
          </div>
        </Form>
      ) : currentSettlement.dispute ? (
        <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-700">
            <CircleAlert className="size-4" />
            {currentSettlement.dispute.status === 'open'
              ? t('bookings.disputePanel.opened')
              : t(
                  `bookings.disputePanel.resolution.${currentSettlement.dispute.resolution ?? 'release'}`,
                )}
          </p>
          {currentSettlement.dispute.partnerResponse ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {t('bookings.disputePanel.partnerResponse')}:{' '}
              </span>
              {currentSettlement.dispute.partnerResponse}
            </p>
          ) : null}
          {currentSettlement.dispute.resolutionNote ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {t('bookings.disputePanel.resolutionNote')}:{' '}
              </span>
              {currentSettlement.dispute.resolutionNote}
            </p>
          ) : null}
          {refundAmount ? (
            <p className="font-medium">
              {t('bookings.disputePanel.refundAmount')}: {refundAmount}
            </p>
          ) : null}
        </div>
      ) : showDisputedFallback ? (
        <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-amber-700">
          <CircleAlert className="size-4" /> {t('bookings.disputePanel.opened')}
        </p>
      ) : null}
    </section>
  );
}
