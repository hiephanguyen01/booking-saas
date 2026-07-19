import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IPaymentBookingReader,
  PaymentBookingRecord,
} from '../../domain/ports/payment-booking-reader.port';

const SELECT = {
  id: true,
  code: true,
  status: true,
  bookingMode: true,
  depositAmount: true,
  securityDeposit: true,
  finalAmount: true,
  paidAmount: true,
} as const;

@Injectable()
export class PrismaPaymentBookingReader implements IPaymentBookingReader {
  findById(tx: PrismaTx, id: string): Promise<PaymentBookingRecord | null> {
    return tx.booking.findUnique({ where: { id }, select: SELECT });
  }

  findByCode(tx: PrismaTx, code: string): Promise<PaymentBookingRecord | null> {
    return tx.booking.findUnique({ where: { code }, select: SELECT });
  }
}
