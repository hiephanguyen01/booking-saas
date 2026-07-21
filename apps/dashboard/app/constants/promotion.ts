import type { PromotionFundedByDto } from '@booking/contracts';

// Promotion-domain display constants (tenant + partner promotion surfaces).

/** Promotion `appliesTo` scope values (§12.2). */
export type ScopeKey = 'all' | 'listing' | 'listing_type' | 'listing_group' | 'category' | 'partner';

/** Scope enum → Vietnamese label — shared by the form and both detail pages (§12.2). */
export const SCOPE_LABELS: Record<ScopeKey, string> = {
  all: 'Toàn bộ cửa hàng',
  listing: 'Một listing cụ thể',
  listing_type: 'Loại dịch vụ',
  listing_group: 'Tin đăng nhiều hạng mục',
  category: 'Danh mục',
  partner: 'Đối tác',
};

/** Who funds the discount → Vietnamese label. */
export const FUNDED_BY_LABELS: Record<PromotionFundedByDto, string> = {
  tenant: 'Cửa hàng',
  partner: 'Đối tác',
};
