import type { BookingMode, BookingStatus } from '@booking/contracts';

// Booking-domain display constants shared across areas (tenant + partner +
// shared booking components). Keys come from @booking/contracts zod enums so a
// new enum member is a compile error here — never retype the union.

/**
 * Booking-mode → Vietnamese label — the ONE map for the whole dashboard.
 * Keyed by the `BookingMode` zod enum so a new mode is a compile error here.
 * `inventory` is presented in partner-facing language as quantity-based rental.
 */
export const BOOKING_MODE_LABEL: Record<BookingMode, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  appointment: 'Lịch hẹn',
  class: 'Lớp học',
  inventory: 'Theo số lượng',
};

/** Additional-charge type → Vietnamese label (§8.3). */
export const CHARGE_LABEL: Record<string, string> = {
  late_fee: 'Phí trễ hạn',
  overtime: 'Phụ trội giờ',
  cleaning: 'Phí vệ sinh',
  damage: 'Đền bù hư hỏng',
};

/** Statuses that are still holding the slot — their `expiresAt` is worth surfacing. */
export const PENDING_BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending_approval',
  'pending_payment',
];
