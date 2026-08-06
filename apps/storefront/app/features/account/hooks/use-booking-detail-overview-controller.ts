import { useState } from 'react';
import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type {
  BookingDetailViewModel,
  BookingDetailState,
} from '~/features/booking/lib/booking-detail-model';

type BookingModeLabelKey = 'hourly' | 'daily' | 'inventory' | 'other';

export function useBookingDetailOverviewController({
  booking,
  state,
  defaultCancelOpen,
  settlement,
}: {
  booking: BookingDetailViewModel;
  state: BookingDetailState;
  defaultCancelOpen: boolean;
  settlement: CustomerBookingSettlementResponse | null;
}) {
  const [cancelOpen, setCancelOpen] = useState(defaultCancelOpen);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const mode: BookingModeLabelKey =
    booking.bookingMode === 'hourly' ||
    booking.bookingMode === 'daily' ||
    booking.bookingMode === 'inventory'
      ? booking.bookingMode
      : 'other';
  const isInventory = booking.bookingMode === 'inventory';
  const canPay = booking.status === 'pending_payment';
  const canCancel = booking.status === 'confirmed';
  // The backend owns this decision: the settlement must sit in an open dispute
  // window, before `disputeUntil`, with no dispute already used. Deriving it
  // from the booking status instead both hid the button on completed bookings
  // and offered it after the window had closed.
  const canDispute = settlement?.canOpenDispute ?? false;
  const showPolicy =
    booking.cancellationTiers.length > 0 || state === 'cancelled' || state === 'absent';

  return {
    canCancel,
    canDispute,
    canPay,
    cancelOpen,
    disputeOpen,
    disputeUntil: canDispute ? (settlement?.disputeUntil ?? null) : null,
    isInventory,
    mode,
    participantCount: String(isInventory ? booking.quantity : booking.guestCount),
    setCancelOpen,
    setDisputeOpen,
    showActions: showPolicy || canPay || canCancel || canDispute,
    showPolicy,
  };
}
