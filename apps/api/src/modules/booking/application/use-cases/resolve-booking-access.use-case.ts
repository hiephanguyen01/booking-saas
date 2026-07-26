import { Inject, Injectable } from '@nestjs/common';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingAccessDenied } from '../../domain/errors/booking-domain-errors';
import {
  BOOKING_ACCESS_GRANT_STORE,
  type IBookingAccessGrantStore,
} from '../../domain/ports/booking-access-grant-store.port';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { OTP_STORE, type IOtpStore } from '../../domain/ports/otp-store.port';

/** Resolve a booking through its customer session, scoped grant, or legacy OTP. */
@Injectable()
export class ResolveBookingAccessUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(OTP_STORE) private readonly otp: IOtpStore,
    @Inject(BOOKING_ACCESS_GRANT_STORE)
    private readonly grants: IBookingAccessGrantStore,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    code: string,
    auth: { accessGrant?: string; otp?: string; sessionUserId?: string },
  ): Promise<BookingRecord> {
    const booking = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.bookings.findByCode(tx, code),
    );
    if (!booking) throw new BookingNotFound();

    if (auth.sessionUserId !== undefined && auth.sessionUserId === booking.customerId) {
      return booking;
    }

    if (
      auth.accessGrant &&
      (await this.grants.verify(
        { tenantId, bookingId: booking.id, bookingCode: booking.code },
        auth.accessGrant,
      ))
    ) {
      return booking;
    }

    if (auth.otp && (await this.otp.verify(booking.code, auth.otp))) {
      return booking;
    }

    throw new BookingAccessDenied();
  }
}
