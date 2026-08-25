import { Inject, Injectable } from '@nestjs/common';
import type { PaymentStatusResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PAYMENT_BOOKING_READER,
  type IPaymentBookingReader,
} from '../../domain/ports/payment-booking-reader.port';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/ports/payment-repository.port';
import { publicPaymentStatus } from '../../domain/payment-status';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';

/** Storefront polls payment status here — never trusts the returnUrl (§11.2). */
@Injectable()
export class GetPaymentStatusUseCase {
  constructor(
    @Inject(PAYMENT_BOOKING_READER) private readonly bookings: IPaymentBookingReader,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, code: string): Promise<PaymentStatusResponse> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const booking = await this.bookings.findByCode(tx, code);
      if (!booking) throw new BookingNotFound();
      const payment = await this.payments.findLatestByBooking(tx, booking.id);
      return {
        bookingCode: code,
        bookingStatus: booking.status,
        paymentStatus: publicPaymentStatus(payment?.status ?? null),
        paymentKind: payment?.kind ?? null,
        paidAmount: booking.paidAmount.toString(),
      };
    });
  }
}
