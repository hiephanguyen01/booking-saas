import type { Locale } from '@booking/contracts';

// Tenant / subscription / vertical display constants (admin + tenant areas).
// The tenant/subscription maps are keyed `Record<string, string>` because the
// platform responses type these fields as plain strings — badge call sites
// index them with `?? status` fallbacks.

export const TENANT_STATUS_LABELS: Record<string, string> = {
  active: 'Đang hoạt động',
  suspended: 'Tạm ngưng',
  expired: 'Hết hạn',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trial: 'Dùng thử',
  active: 'Đang hiệu lực',
  past_due: 'Quá hạn thanh toán',
  expired: 'Hết hạn',
  cancelled: 'Đã huỷ',
};

export const VERTICAL_LABELS: Record<string, string> = {
  studio: 'Studio',
  rental: 'Cho thuê',
  classes: 'Lớp học',
};

export const LOCALE_LABELS: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' };

/** Subscription lifecycle phase (tenant overview banner) → Vietnamese label. */
export const SUB_PHASE_LABEL: Record<'active' | 'grace' | 'expired', string> = {
  active: 'Đang hiệu lực',
  grace: 'Đang gia hạn',
  expired: 'Đã hết hạn',
};
