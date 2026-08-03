import type {
  CancellationPolicySource,
  CommissionAppliesToDto,
  LedgerEntryTypeDto,
  LedgerOwnerTypeDto,
  PayoutResponse,
  SettlementDisputeResponse,
  SettlementStatusDto,
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
  affiliate: 'Cộng tác viên',
};

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatusDto, string> = {
  held: 'Tenant đang giữ',
  dispute_window: 'Trong thời gian tranh chấp',
  disputed: 'Đang tranh chấp',
  refund_pending: 'Chờ xác nhận hoàn tiền',
  released: 'Đã ghi nhận & sẵn sàng chi',
  refunded: 'Đã hoàn tiền',
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

/** Payout payee type → Vietnamese label (payouts table + create-payout dialog). */
export const PAYEE_TYPE_LABEL: Record<PayoutResponse['payeeType'], string> = {
  partner: 'Đối tác',
  affiliate: 'Cộng tác viên',
};

/** Settlement-dispute status → Vietnamese label (tenant finance dispute queue). */
export const DISPUTE_STATUS_LABEL: Record<SettlementDisputeResponse['status'], string> = {
  open: 'Chờ xử lý',
  accepted: 'Chấp nhận',
  rejected: 'Từ chối',
  resolved: 'Đã giải quyết',
};

/**
 * The dispute-status choices the three queues (tenant · admin · partner) filter
 * by, derived from {@link DISPUTE_STATUS_LABEL}. The three pages used to inline
 * their own copy and had drifted: `open` read "Chờ xử lý" on one and "Đang xử
 * lý" on the other two.
 */
export const DISPUTE_STATUS_FILTER_OPTIONS = (
  ['open', 'accepted', 'rejected'] as const
).map((status) => ({ value: status, label: DISPUTE_STATUS_LABEL[status] }));

/** What a commission rule applies to → Vietnamese label. */
export const COMMISSION_SCOPE_LABEL: Record<CommissionAppliesToDto, string> = {
  tenant_default: 'Mặc định toàn tenant',
  partner: 'Đối tác',
  listing_type: 'Loại dịch vụ',
  category: 'Danh mục',
};

/** Where a listing's effective cancellation policy came from (partner's point of view). */
export const CANCELLATION_SOURCE_LABEL: Record<CancellationPolicySource, string> = {
  listing: 'Riêng tin đăng',
  partner: 'Mặc định của bạn',
  tenant: 'Mặc định hệ thống',
};
