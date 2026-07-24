import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import { formatCurrency, formatDateTime, type Locale } from '@booking/i18n';
import { useNavigation } from 'react-router';

export function useCustomerSettlementDisputePanelController({
  settlement,
  locale,
}: {
  settlement: CustomerBookingSettlementResponse | null;
  locale: Locale;
}) {
  const navigation = useNavigation();
  if (!settlement) return null;

  const deadline = settlement.disputeUntil ? new Date(settlement.disputeUntil) : null;
  const dispute = settlement.dispute;
  const refundAmount =
    dispute && BigInt(dispute.refundAmount) > 0n
      ? formatCurrency(BigInt(dispute.refundAmount), 'VND', locale)
      : null;

  return {
    settlement,
    canOpen: settlement.canOpenDispute,
    submitting:
      navigation.state === 'submitting' && navigation.formData?.get('intent') === 'dispute',
    heldAmount: formatCurrency(BigInt(settlement.remainingHeldAmount), 'VND', locale),
    deadlineLabel: deadline ? formatDateTime(deadline, locale, 'Asia/Ho_Chi_Minh') : '-',
    refundAmount,
    showDisputedFallback: !dispute && settlement.status === 'disputed',
  };
}
