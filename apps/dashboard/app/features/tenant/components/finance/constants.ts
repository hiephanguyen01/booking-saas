import type { PayoutResponse } from '@booking/contracts';

/** Payout payee type → Vietnamese label (payouts table + create-payout dialog). */
export const PAYEE_TYPE_LABEL: Record<PayoutResponse['payeeType'], string> = {
  partner: 'Đối tác',
  affiliate: 'Affiliate',
};
