import { useState } from 'react';
import type {
  BookingDetailViewModel,
  BookingDetailState,
} from '~/features/booking/lib/booking-detail-model';

type BookingModeLabelKey = 'hourly' | 'daily' | 'inventory' | 'other';

export function useBookingDetailOverviewController({
  booking,
  state,
  defaultCancelOpen,
}: {
  booking: BookingDetailViewModel;
  state: BookingDetailState;
  defaultCancelOpen: boolean;
}) {
  const [cancelOpen, setCancelOpen] = useState(defaultCancelOpen);
  const mode: BookingModeLabelKey =
    booking.bookingMode === 'hourly' ||
    booking.bookingMode === 'daily' ||
    booking.bookingMode === 'inventory'
      ? booking.bookingMode
      : 'other';
  const isInventory = booking.bookingMode === 'inventory';
  const canPay = booking.status === 'pending_payment';
  const canCancel = booking.status === 'confirmed';
  const canDispute = state === 'absent';
  const showPolicy =
    booking.cancellationTiers.length > 0 || state === 'cancelled' || state === 'absent';

  return {
    canCancel,
    canDispute,
    canPay,
    cancelOpen,
    isInventory,
    mode,
    participantCount: String(isInventory ? booking.quantity : booking.guestCount),
    setCancelOpen,
    showActions: showPolicy || canPay || canCancel || canDispute,
    showPolicy,
  };
}
