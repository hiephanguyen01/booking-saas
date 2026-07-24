import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import { BookingAccessDenied } from '../../domain/errors/booking-domain-errors';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { OTP_STORE, type IOtpStore } from '../../domain/ports/otp-store.port';

/**
 * Resolve a booking for guest access (§8.6): a matching session customer OR a
 * valid OTP authorizes it. Used by the view + cancel endpoints.
 */
@Injectable()
export class ResolveBookingAccessUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(OTP_STORE) private readonly otp: IOtpStore,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    code: string,
    auth: { otp?: string; sessionUserId?: string },
  ): Promise<BookingRecord> {
    const booking = await this.tenantDb.forTenant(tenantId, (tx) => this.bookings.findByCode(tx, code));
    if (!booking) throw new BookingNotFound();

    const ownedBySession = auth.sessionUserId !== undefined && auth.sessionUserId === booking.customerId;
    const otpValid = auth.otp !== undefined && (await this.otp.verify(code, auth.otp));
    if (!ownedBySession && !otpValid) {
      throw new BookingAccessDenied();
    }
    return booking;
  }
}
