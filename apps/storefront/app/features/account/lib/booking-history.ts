import type {
  AdditionalCharge,
  BookingResponse,
  BookingStatus,
  CancellationTier,
  CustomerReviewItem,
  QuoteLineItem,
} from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import {
  cancellationCutoffParts,
  cancellationPolicyLines as sharedCancellationPolicyLines,
  type CancellationPolicyLine,
} from '~/lib/cancellation-policy';
import { dateOnlyInTz, nightsBetween } from '~/lib/time';

export { cancellationCutoffParts, type CancellationPolicyLine };

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
export type BookingDetailState = 'need-payment' | 'coming-soon' | 'done' | 'absent' | 'cancelled';

export interface AccountBookingViewModel {
  id: string;
  code: string;
  status: BookingStatus;
  variant: BookingDetailVariant;
  partnerName: string;
  listingSlug: string;
  listingTitle: string;
  listingDescription: string | null;
  imageUrl: string | null;
  resourceName: string;
  resourceTimezone: string;
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
  damageAmount: string;
  additionalCharges: AdditionalCharge[];
  promoCode: string | null;
  pricingLineItems: QuoteLineItem[];
  pickedUpAt: string | null;
  returnedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  balanceAmount: string;
  cancellationTiers: CancellationTier[];
  refundAmount: string | null;
  refundPercent: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  attributes: Array<{ label: string; value: string }>;
  review: CustomerReviewItem | null;
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

const DETAIL_STATES: Record<BookingStatus, BookingDetailState> = {
  draft: 'need-payment',
  pending_approval: 'coming-soon',
  pending_payment: 'need-payment',
  confirmed: 'coming-soon',
  cancelled: 'cancelled',
  completed: 'done',
  no_show: 'absent',
  rejected: 'cancelled',
  expired: 'cancelled',
  refunded: 'cancelled',
};

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

export function bookingDetailState(status: BookingStatus): BookingDetailState {
  return DETAIL_STATES[status];
}

/**
 * Maps the booking's frozen cancellation tiers (sorted by `toAccountBookingViewModel`,
 * most-lenient first) to one display line per tier. The cutoff date/time and fee amount
 * are computed from the booking's own `startUtc`/`depositAmount` — nothing here is a
 * fixed bracket or invented copy, only real numbers from `cancellationPolicySnapshot`.
 */
export function cancellationPolicyLines(
  booking: Pick<AccountBookingViewModel, 'startUtc' | 'depositAmount' | 'cancellationTiers'>,
): CancellationPolicyLine[] {
  return sharedCancellationPolicyLines({
    startUtc: booking.startUtc,
    depositAmount: booking.depositAmount,
    tiers: booking.cancellationTiers,
  });
}

function durationLabel(booking: BookingResponse, locale: Locale): string {
  if (booking.bookingMode === 'daily') {
    const from = dateOnlyInTz(booking.startUtc, booking.resourceTimezone);
    const to = dateOnlyInTz(booking.endUtc, booking.resourceTimezone);
    const days = Math.max(1, nightsBetween(from, to));
    return locale === 'en' ? `${days} ${days === 1 ? 'day' : 'days'}` : `${days} ngày`;
  }
  if (booking.bookingMode === 'inventory') {
    return locale === 'en' ? `${booking.quantity} items` : `${booking.quantity} sản phẩm`;
  }
  const start = Date.parse(booking.startUtc);
  const end = Date.parse(booking.endUtc);
  const hours = Math.max(1, Math.round((end - start) / 3_600_000));
  return locale === 'en' ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${hours} giờ`;
}

function dateLabel(value: string, locale: Locale, timezone: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(value));
}

function timeLabel(startUtc: string, endUtc: string, locale: Locale, timezone: string): string {
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
  return `${formatter.format(new Date(startUtc))} - ${formatter.format(new Date(endUtc))}`;
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
  review: CustomerReviewItem | null = null,
): AccountBookingViewModel {
  return {
    id: booking.id,
    code: booking.code,
    status: booking.status,
    variant: bookingVariant(booking.status),
    partnerName: booking.partnerName,
    listingSlug: booking.listingSlug,
    listingTitle: booking.listingTitle,
    listingDescription: booking.listingDescription,
    imageUrl: booking.listingImageUrl,
    resourceName: booking.resourceName,
    resourceTimezone: booking.resourceTimezone,
    startUtc: booking.startUtc,
    endUtc: booking.endUtc,
    dateLabel: dateLabel(booking.startUtc, locale, booking.resourceTimezone),
    timeLabel: timeLabel(booking.startUtc, booking.endUtc, locale, booking.resourceTimezone),
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
    damageAmount: booking.damageAmount,
    additionalCharges: booking.additionalCharges,
    promoCode: booking.promoCode,
    pricingLineItems: pricingLineItems(booking.pricingSnapshot),
    pickedUpAt: booking.pickedUpAt,
    returnedAt: booking.returnedAt,
    expiresAt: booking.expiresAt,
    createdAt: booking.createdAt,
    balanceAmount: subtractMoney(booking.finalAmount, booking.paidAmount),
    cancellationTiers: [...(booking.cancellationPolicySnapshot ?? [])].sort(
      (a, b) => b.hoursBefore - a.hoursBefore,
    ),
    refundAmount: booking.refundDueAmount,
    refundPercent: booking.refundPercent,
    cancelledAt: null,
    cancellationReason: null,
    attributes: displayAttributes(booking.listingAttributes),
    review,
  };
}

function pricingLineItems(snapshot: BookingResponse['pricingSnapshot']): QuoteLineItem[] {
  if (!snapshot || !Array.isArray(snapshot.lineItems)) return [];
  return snapshot.lineItems.filter((item): item is QuoteLineItem => {
    if (!item || typeof item !== 'object') return false;
    const line = item as Partial<QuoteLineItem>;
    return (
      typeof line.label === 'string' &&
      typeof line.quantity === 'number' &&
      typeof line.unitPrice === 'string' &&
      typeof line.regularUnitPrice === 'string' &&
      typeof line.amount === 'string' &&
      typeof line.regularAmount === 'string'
    );
  });
}

function displayAttributes(
  attributes: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  return Object.entries(attributes).flatMap(([label, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return [{ label, value: String(value) }];
    }
    if (Array.isArray(value)) {
      const values = value.filter((item) => typeof item === 'string' || typeof item === 'number');
      return values.length ? [{ label, value: values.join(', ') }] : [];
    }
    return [];
  });
}
