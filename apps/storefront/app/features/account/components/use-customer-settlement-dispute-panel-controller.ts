import type { FormEvent } from 'react';
import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import { formatCurrency, formatDateTime, type Locale } from '@booking/i18n';
import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';
import { useNavigation, useSubmit } from 'react-router';

export function useCustomerSettlementDisputePanelController({
  settlement,
  locale,
}: {
  settlement: CustomerBookingSettlementResponse | null;
  locale: Locale;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy: submitting, run } = useSubmissionGuard(navigation.state);
  if (!settlement) return null;

  const deadline = settlement.disputeUntil ? new Date(settlement.disputeUntil) : null;
  const dispute = settlement.dispute;
  const refundAmount =
    dispute && BigInt(dispute.refundAmount) > 0n
      ? formatCurrency(BigInt(dispute.refundAmount), 'VND', locale)
      : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return {
    settlement,
    canOpen: settlement.canOpenDispute,
    handleSubmit,
    submitting,
    heldAmount: formatCurrency(BigInt(settlement.remainingHeldAmount), 'VND', locale),
    deadlineLabel: deadline ? formatDateTime(deadline, locale, 'Asia/Ho_Chi_Minh') : '-',
    refundAmount,
    showDisputedFallback: !dispute && settlement.status === 'disputed',
  };
}
