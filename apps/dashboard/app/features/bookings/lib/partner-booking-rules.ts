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
  endUtc: string;
}

/** 48h after the slot end — matches the backend no-show window (§8.2). */
export const NO_SHOW_AFTER_END_MS = 48 * 60 * 60 * 1000;

/** A confirmed booking whose slot end + the backend's 48h window has elapsed. */
export function isNoShowEligible(booking: PartnerActionableBooking): boolean {
  return (
    booking.status === 'confirmed' &&
    Date.now() >= new Date(booking.endUtc).getTime() + NO_SHOW_AFTER_END_MS
  );
}

/** Every action a partner can take on a booking, in display order. */
export type PartnerBookingActionKind =
  | 'approve'
  | 'reject'
  | 'pick-up'
  | 'return'
  | 'no-show'
  | 'cancel';

/**
 * The actions available for one booking, derived from its status/fulfillment
 * state and the caller's permissions (§8.2 / §9.4). Pure — the component maps
 * the result to buttons, the rules stay testable without React.
 */
export function availablePartnerBookingActions(
  booking: PartnerActionableBooking,
  { canApprove, canManage }: { canApprove: boolean; canManage: boolean },
): PartnerBookingActionKind[] {
  const actions: PartnerBookingActionKind[] = [];
  const isInventory = booking.bookingMode === 'inventory';

  if (booking.status === 'pending_approval' && canApprove) {
    actions.push('approve', 'reject');
  }
  if (booking.status === 'confirmed' && canManage) {
    if (isInventory && !booking.pickedUpAt) actions.push('pick-up');
    if (isInventory && booking.pickedUpAt && !booking.returnedAt) actions.push('return');
    if (isNoShowEligible(booking)) actions.push('no-show');
  }
  if ((booking.status === 'confirmed' || booking.status === 'pending_payment') && canManage) {
    actions.push('cancel');
  }
  return actions;
}
