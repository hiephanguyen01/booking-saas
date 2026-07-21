import type {
  AttributeFieldType,
  BalanceDue,
  ContactFlag,
  ListingTypeSearchSchedule,
} from '@booking/contracts';

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

/**
 * Backend checklist keys → Vietnamese labels for a SINGLE listing's review.
 * The price/cancellation wording differs from the group review on purpose:
 * a listing's checks cover its booking modes, a group's cover its child items.
 */
export const LISTING_CHECKLIST_LABEL: Record<string, string> = {
  photos: 'Có ít nhất 1 ảnh',
  description: 'Có mô tả',
  price: 'Mọi hình thức đặt đều có giá',
  cancellation_policy: 'Có chính sách huỷ',
};

/** Checklist labels for a listing GROUP's review (checks span the child items). */
export const GROUP_CHECKLIST_LABEL: Record<string, string> = {
  photos: 'Có ít nhất 1 ảnh',
  description: 'Có mô tả',
  price: 'Mọi hạng mục đều có giá',
  cancellation_policy: 'Mọi hạng mục có chính sách huỷ',
};

/** When the remaining balance is collected → Vietnamese label. */
export const BALANCE_DUE_LABEL: Record<BalanceDue, string> = {
  online_before: 'Trực tuyến trước',
  on_arrival: 'Tại chỗ',
};

/** Storefront search schedule mode → Vietnamese label (listing-type config). */
export const SEARCH_SCHEDULE_LABEL: Record<ListingTypeSearchSchedule, string> = {
  none: 'Không dùng lịch',
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Theo kho',
};

/** Dynamic-attribute field type → Vietnamese label (listing-type builder). */
export const ATTRIBUTE_FIELD_TYPE_LABEL: Record<AttributeFieldType, string> = {
  text: 'Văn bản',
  number: 'Số',
  select: 'Chọn một',
  multiselect: 'Chọn nhiều',
  boolean: 'Có/Không',
};
