import type { BookingMode, BookingStatus } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PAYMENT_BOOKING_READER = Symbol('PAYMENT_BOOKING_READER');

/** Payments-owned read model; avoids importing Booking module application code. */
export interface PaymentBookingRecord {
  id: string;
  code: string;
  status: BookingStatus;
  bookingMode: BookingMode;
  depositAmount: bigint;
  securityDeposit: bigint;
  finalAmount: bigint;
  paidAmount: bigint;
}

export interface IPaymentBookingReader {
  findById(tx: PrismaTx, id: string): Promise<PaymentBookingRecord | null>;
  findByCode(tx: PrismaTx, code: string): Promise<PaymentBookingRecord | null>;
}
