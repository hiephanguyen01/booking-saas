import type { BookingResponse, BookingStatus, CancellationTier } from '@booking/contracts';
import type { Locale } from '@booking/i18n';

export const BOOKING_HISTORY_FILTERS = [
  'all',
  'payment',
  'upcoming',
  'completed',
  'cancelled',
  'no-show',
] as const;

export type BookingHistoryFilter = (typeof BOOKING_HISTORY_FILTERS)[number];
export type BookingDetailVariant = Exclude<BookingHistoryFilter, 'all'>;

export interface AccountBookingReview {
  state: 'pending' | 'reviewed';
  rating?: number;
  body?: string;
  response?: string;
  photos?: string[];
}

export interface AccountBookingViewModel {
  id: string;
  code: string;
  status: BookingStatus;
  variant: BookingDetailVariant;
  studioName: string;
  listingTitle: string;
  imageUrl: string;
  startUtc: string;
  endUtc: string;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  customer: BookingResponse['customer'];
  customerNote: string | null;
  bookingMode: string;
  quantity: number;
  guestCount: number;
  totalAmount: string;
  discountAmount: string;
  finalAmount: string;
  depositAmount: string;
  paidAmount: string;
  securityDeposit: string;
  balanceAmount: string;
  paymentMethod: string | null;
  cancellationTiers: CancellationTier[];
  refundAmount: string | null;
  refundPercent: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  attributes: Array<{ label: string; value: string }>;
  amenities: string[];
  description: string | null;
  review: AccountBookingReview | null;
  demo: boolean;
}

export interface AccountBookingFixture {
  booking: BookingResponse;
  presentation: Partial<
    Pick<
      AccountBookingViewModel,
      | 'studioName'
      | 'imageUrl'
      | 'paymentMethod'
      | 'refundAmount'
      | 'refundPercent'
      | 'cancelledAt'
      | 'cancellationReason'
      | 'attributes'
      | 'amenities'
      | 'description'
      | 'review'
    >
  >;
}

const STATUS_FILTERS: Record<BookingStatus, BookingDetailVariant> = {
  draft: 'payment',
  pending_approval: 'upcoming',
  pending_payment: 'payment',
  confirmed: 'upcoming',
  cancelled: 'cancelled',
  completed: 'completed',
  no_show: 'no-show',
  rejected: 'cancelled',
  expired: 'cancelled',
  refunded: 'cancelled',
};

const FALLBACK_IMAGES = [
  '/images/booking-studio/home/studio-1.jpg',
  '/images/booking-studio/home/studio-2.jpg',
  '/images/booking-studio/home/studio-3.jpg',
] as const;

export function parseBookingHistoryFilter(value: string | null): BookingHistoryFilter {
  return BOOKING_HISTORY_FILTERS.includes(value as BookingHistoryFilter)
    ? (value as BookingHistoryFilter)
    : 'all';
}

export function bookingMatchesFilter(
  booking: Pick<AccountBookingViewModel, 'variant'>,
  filter: BookingHistoryFilter,
): boolean {
  return filter === 'all' || booking.variant === filter;
}

export function bookingVariant(status: BookingStatus): BookingDetailVariant {
  return STATUS_FILTERS[status];
}

function durationLabel(booking: BookingResponse, locale: Locale): string {
  const start = Date.parse(booking.startUtc);
  const end = Date.parse(booking.endUtc);
  const hours = Math.max(1, Math.round((end - start) / 3_600_000));
  if (booking.bookingMode === 'daily') {
    const days = Math.max(1, Math.ceil(hours / 24));
    return locale === 'en' ? `${days} ${days === 1 ? 'day' : 'days'}` : `${days} ngày`;
  }
  if (booking.bookingMode === 'inventory') {
    return locale === 'en' ? `${booking.quantity} items` : `${booking.quantity} sản phẩm`;
  }
  return locale === 'en' ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${hours} giờ`;
}

function dateLabel(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

function timeLabel(startUtc: string, endUtc: string, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  return `${formatter.format(new Date(startUtc))} – ${formatter.format(new Date(endUtc))}`;
}

function subtractMoney(total: string, paid: string): string {
  try {
    const balance = BigInt(total) - BigInt(paid);
    return (balance > 0n ? balance : 0n).toString();
  } catch {
    return '0';
  }
}

export function toAccountBookingViewModel(
  booking: BookingResponse,
  locale: Locale,
  fixture?: AccountBookingFixture['presentation'],
): AccountBookingViewModel {
  const imageIndex =
    Math.abs([...booking.code].reduce((sum, char) => sum + char.charCodeAt(0), 0)) %
    FALLBACK_IMAGES.length;
  return {
    id: booking.id,
    code: booking.code,
    status: booking.status,
    variant: bookingVariant(booking.status),
    studioName: fixture?.studioName ?? booking.listingTitle,
    listingTitle: booking.listingTitle,
    imageUrl: fixture?.imageUrl ?? FALLBACK_IMAGES[imageIndex],
    startUtc: booking.startUtc,
    endUtc: booking.endUtc,
    dateLabel: dateLabel(booking.startUtc, locale),
    timeLabel: timeLabel(booking.startUtc, booking.endUtc, locale),
    durationLabel: durationLabel(booking, locale),
    customer: booking.customer,
    customerNote: booking.customerNote,
    bookingMode: booking.bookingMode,
    quantity: booking.quantity,
    guestCount: booking.guestCount,
    totalAmount: booking.totalAmount,
    discountAmount: booking.discountAmount,
    finalAmount: booking.finalAmount,
    depositAmount: booking.depositAmount,
    paidAmount: booking.paidAmount,
    securityDeposit: booking.securityDeposit,
    balanceAmount: subtractMoney(booking.finalAmount, booking.paidAmount),
    paymentMethod: fixture?.paymentMethod ?? null,
    cancellationTiers: [...(booking.cancellationPolicySnapshot ?? [])].sort(
      (a, b) => b.hoursBefore - a.hoursBefore,
    ),
    refundAmount: fixture?.refundAmount ?? booking.refundDueAmount,
    refundPercent: fixture?.refundPercent ?? booking.refundPercent,
    cancelledAt: fixture?.cancelledAt ?? null,
    cancellationReason: fixture?.cancellationReason ?? null,
    attributes: fixture?.attributes ?? [],
    amenities: fixture?.amenities ?? [],
    description: fixture?.description ?? null,
    review: fixture?.review ?? null,
    demo: Boolean(fixture),
  };
}
