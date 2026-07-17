import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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
    if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });

    const ownedBySession = auth.sessionUserId !== undefined && auth.sessionUserId === booking.customerId;
    const otpValid = auth.otp !== undefined && (await this.otp.verify(code, auth.otp));
    if (!ownedBySession && !otpValid) {
      throw new UnauthorizedException({ statusCode: 401, code: 'BOOKING_ACCESS_DENIED', message: 'A valid OTP or session is required' });
    }
    return booking;
  }
}
