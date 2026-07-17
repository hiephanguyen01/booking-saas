import type { AffiliateCommissionStatusDto, ReferralTargetDto } from '@booking/contracts';

// Affiliate-domain display constants (tenant affiliates + affiliate portal).

/** Commission status → Vietnamese label. */
export const COMMISSION_STATUS_LABEL: Record<AffiliateCommissionStatusDto, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  paid: 'Đã trả',
  reversed: 'Đã huỷ',
  clawed_back: 'Đã thu hồi',
};

/** Referral-link target → Vietnamese label. */
export const REFERRAL_TARGET_LABEL: Record<ReferralTargetDto, string> = {
  tenant_home: 'Trang chủ',
  listing: 'Listing',
};
