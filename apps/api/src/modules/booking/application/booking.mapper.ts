import type { BookingResponse, CancelBookingResponse, ReturnBookingResponse } from '@booking/shared';
import type { BookingRecord } from '../domain/ports/booking-repository.port';
import type { CancelResult } from './use-cases/cancel-booking.use-case';
import type { ReturnResult } from './use-cases/inventory-fulfillment.use-case';

export function toBookingResponse(b: BookingRecord): BookingResponse {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    listingId: b.listingId,
    resourceId: b.resourceId,
    partnerId: b.partnerId,
    bookingMode: b.bookingMode,
    startUtc: b.startUtc.toISOString(),
    endUtc: b.endUtc.toISOString(),
    guestCount: b.guestCount,
    quantity: b.quantity,
    totalAmount: b.totalAmount.toString(),
    discountAmount: b.discountAmount.toString(),
    finalAmount: b.finalAmount.toString(),
    depositAmount: b.depositAmount.toString(),
    paidAmount: b.paidAmount.toString(),
    securityDeposit: b.securityDeposit.toString(),
    pickedUpAt: b.pickedUpAt?.toISOString() ?? null,
    returnedAt: b.returnedAt?.toISOString() ?? null,
    damageAmount: b.damageAmount.toString(),
    customerNote: b.customerNote,
    expiresAt: b.expiresAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  };
}

export function toCancelResponse(r: CancelResult): CancelBookingResponse {
  return { ...toBookingResponse(r.booking), refundAmount: r.refundAmount.toString(), refundPercent: r.refundPercent };
}

export function toReturnResponse(r: ReturnResult): ReturnBookingResponse {
  return {
    ...toBookingResponse(r.booking),
    lateFee: r.lateFee.toString(),
    depositRefund: r.depositRefund.toString(),
    depositShortfall: r.depositShortfall.toString(),
  };
}
