import type { TranslationShape } from '../translation-shape';
import type { viCheckout } from '../vi/checkout';

export const enCheckout = {
  title: 'Confirm & pay',
  summary: 'Booking summary',
  guestSection: 'Your details',
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone number',
  note: 'Note (optional)',
  promoSection: 'Promo code',
  promoPlaceholder: 'Enter code',
  promoApply: 'Apply',
  promoApplied: 'Applied {code} — {amount} off',
  promoRemove: 'Remove',
  discount: 'Discount',
  total: 'Total',
  payNow: 'Book & pay',
  invalidSlot: 'The selected schedule is invalid. Please pick again.',
  creating: 'Creating booking…',
  dueNow: 'Due now',
  promoErrors: {
    PROMO_NOT_FOUND: 'Code not found.',
    PROMO_EXPIRED: 'This code has expired.',
    PROMO_LIMIT_REACHED: 'This code has no uses left.',
    PROMO_MIN_ORDER: 'Order value is below the minimum for this code.',
    PROMO_NOT_APPLICABLE: 'This code does not apply to this item.',
    PROMO_FIRST_BOOKING_ONLY: 'This code is for first-time bookings only.',
    generic: 'Could not apply the code.',
  },
} satisfies TranslationShape<typeof viCheckout>;
