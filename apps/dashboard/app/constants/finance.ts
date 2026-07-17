import type {
  LedgerEntryTypeDto,
  LedgerOwnerTypeDto,
  TenantPayableResponse,
} from '@booking/contracts';

// Finance-domain display constants (tenant finance + partner revenue).

/**
 * Ledger entry type → Vietnamese label. Canonical wording — reconciles the
 * former tenant-ledger/partner-revenue twins ('Chia sẻ đối tác'/'Phần đối tác',
 * 'Phụ thu'/'Phụ phí', …).
 */
export const LEDGER_ENTRY_LABEL: Record<LedgerEntryTypeDto, string> = {
  booking_revenue: 'Doanh thu đặt chỗ',
  partner_share: 'Phần đối tác',
  platform_fee: 'Phí nền tảng',
  affiliate_commission: 'Hoa hồng CTV',
  promo_discount: 'Giảm giá khuyến mãi',
  cancellation_fee: 'Phí huỷ',
  additional_charge: 'Phụ thu',
  security_deposit: 'Tiền đặt cọc',
  damage_deduction: 'Khấu trừ hư hỏng',
  clawback: 'Thu hồi',
  refund: 'Hoàn tiền',
  payout: 'Chi trả',
};

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
