import type { ContactFlag } from '@booking/contracts';

// Tenant-area-only display constants. Constants used by 2+ areas live in
// ~/constants/* instead (hybrid rule).

/** Contact-scan flag type → Vietnamese label (moderation review pages). */
export const CONTACT_FLAG_LABEL: Record<ContactFlag['type'], string> = {
  phone: 'Số điện thoại',
  zalo: 'Zalo',
  url: 'Liên kết',
  email: 'Email',
};

/** Scanned listing field → Vietnamese label (moderation review pages). */
export const CONTACT_FIELD_LABEL: Record<string, string> = {
  title: 'Tiêu đề',
  description: 'Mô tả',
};
