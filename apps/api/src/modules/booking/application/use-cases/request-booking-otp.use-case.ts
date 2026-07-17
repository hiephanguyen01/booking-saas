import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { SendBookingOtpUseCase } from '../../../notification/application/use-cases/send-booking-otp.use-case';
import { BOOKING_REPOSITORY, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { OTP_STORE, type IOtpStore } from '../../domain/ports/otp-store.port';

const IS_PROD = process.env.NODE_ENV === 'production';

/** Issue an OTP for a booking code and email it to the booking's customer (§8.6). */
@Injectable()
export class RequestBookingOtpUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(OTP_STORE) private readonly otp: IOtpStore,
    private readonly tenantDb: TenantDbService,
    private readonly sendBookingOtp: SendBookingOtpUseCase,
  ) {}

  async execute(tenantId: string, code: string): Promise<{ code: string; expiresInSec: number; devOtp?: string }> {
    const booking = await this.tenantDb.forTenant(tenantId, (tx) => this.bookings.findByCode(tx, code));
    if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    const { otp, expiresInSec } = await this.otp.issue(code);
    // Synchronous send — the plaintext OTP is never persisted, so it can't ride the
    // outbox. `sendBookingOtp` swallows its own delivery errors (the code stays valid).
    await this.sendBookingOtp.execute(tenantId, booking.id, otp, expiresInSec);
    return { code, expiresInSec, ...(IS_PROD ? {} : { devOtp: otp }) };
  }
}
