// Fallback copy for loader/action failures. These are the sentences a route
// falls back to when the backend gives no message of its own, and the same
// situation used to be worded two ways — "Hành động không hợp lệ." in 15 places
// and "Thao tác không hợp lệ." in 3, for the identical rejected-intent case.
//
// Only genuinely shared, situation-generic copy belongs here. Screen-specific
// wording ("Không có quyền tạo tin đăng.") stays at its call site, where it
// reads with the code that produced it.

export const actionMessages = {
  /** A posted `intent` the action does not recognise. */
  invalidIntent: 'Hành động không hợp lệ.',
  /** A malformed request body / missing form field. */
  invalidRequest: 'Yêu cầu không hợp lệ.',
  /** A write that failed with no upstream explanation. */
  saveFailed: 'Lưu không thành công.',
  /** A non-write operation that failed with no upstream explanation. */
  actionFailed: 'Thao tác không thành công.',
} as const;

export const notFoundMessages = {
  listing: 'Không tìm thấy tin đăng.',
  listingType: 'Không tìm thấy loại dịch vụ.',
} as const;
