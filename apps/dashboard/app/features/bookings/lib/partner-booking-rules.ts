import type { BookingStatus } from '@booking/contracts';

/**
 * The minimal booking shape the action buttons need. Both
 * `PartnerCalendarBookingResponse` (list/calendar feed) and
 * `PartnerBookingResponse` (detail) satisfy it structurally, so one component
 * serves every partner surface.
 */
export interface PartnerActionableBooking {
  id: string;
  code: string;
  status: BookingStatus;
  bookingMode: string;
  listingTitle: string;
  pickedUpAt: string | null;
  returnedAt: string | null;
  securityDeposit: string;
  finalAmount: string;
  paidAmount: string;
  additionalCharges: Array<{ type: string; amount: string; note?: string }>;
  endUtc: string;
}

/** No-show may be reported from slot end through end + 48h. */
export const NO_SHOW_WINDOW_MS = 48 * 60 * 60 * 1000;

/** A confirmed booking currently inside the backend's 48h no-show window. */
export function isNoShowEligible(booking: PartnerActionableBooking, now: number): boolean {
  const end = new Date(booking.endUtc).getTime();
  return (
    booking.status === 'confirmed' &&
    now >= end &&
    now <= end + NO_SHOW_WINDOW_MS
  );
}

/** Every action a partner can take on a booking, in display order. */
export type PartnerBookingActionKind =
  | 'approve'
  | 'reject'
  | 'complete'
  | 'pick-up'
  | 'return'
  | 'no-show'
  | 'cancel';

/**
 * The actions available for one booking, derived from its status/fulfillment
 * state, permissions, and an explicitly supplied clock (§8.2 / §9.4).
 */
export function availablePartnerBookingActions(
  booking: PartnerActionableBooking,
  {
    canApprove,
    canManage,
    canWrite,
  }: { canApprove: boolean; canManage: boolean; canWrite: boolean },
  now: number,
): PartnerBookingActionKind[] {
  const actions: PartnerBookingActionKind[] = [];
  const isInventory = booking.bookingMode === 'inventory';

  if (booking.status === 'pending_approval' && canApprove) {
    actions.push('approve', 'reject');
  }
  if (booking.status === 'confirmed' && canManage) {
    if (isInventory && !booking.pickedUpAt) actions.push('pick-up');
    if (isInventory && booking.pickedUpAt && !booking.returnedAt) actions.push('return');
    if (isNoShowEligible(booking, now)) actions.push('no-show');
  }
  if (
    booking.status === 'confirmed' &&
    booking.bookingMode !== 'inventory' &&
    canWrite &&
    now >= new Date(booking.endUtc).getTime()
  ) {
    actions.unshift('complete');
  }
  if (booking.status === 'confirmed' && canManage) {
    actions.push('cancel');
  }
  return actions;
}
