import type { LedgerOwnerTypeDto, TenantPayableResponse } from '@booking/contracts';

// Finance-domain display constants (tenant finance + partner revenue).

/** Ledger owner type → Vietnamese label. */
export const LEDGER_OWNER_LABEL: Record<LedgerOwnerTypeDto, string> = {
  platform: 'Nền tảng',
  tenant: 'Cửa hàng',
  partner: 'Đối tác',
  affiliate: 'Affiliate',
};

/** Why a payout run cannot be created right now (backend ineligible reasons). */
export const PAYOUT_INELIGIBLE_REASON: Record<
  NonNullable<TenantPayableResponse['ineligibleReason']>,
  string
> = {
  NOTHING_TO_PAY:
    'Chưa có số dư đủ điều kiện để chi — toàn bộ đang trong thời gian giữ hoặc đã nằm trong lệnh chi chờ xử lý.',
  BELOW_MINIMUM: 'Số tiền đủ điều kiện chưa đạt mức tối thiểu của một kỳ chi trả.',
};
