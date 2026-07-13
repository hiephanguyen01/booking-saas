import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { DispatchNotificationService } from '../../../notification/application/dispatch-notification.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { OTP_STORE, type IOtpStore } from '../../domain/ports/otp-store.port';

const IS_PROD = process.env.NODE_ENV === 'production';

/** Guest lookup/cancel (§8.6) + logged-in customer's booking list. */
@Injectable()
export class BookingLookupUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(OTP_STORE) private readonly otp: IOtpStore,
    private readonly tenantDb: TenantDbService,
    private readonly notifier: DispatchNotificationService,
  ) {}

  listMyBookings(tenantId: string, customerId: string): Promise<BookingRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.bookings.listByCustomer(tx, customerId));
  }

  /** Fetch a booking by code with no auth check (dev/mock-pay path only). */
  async byCode(tenantId: string, code: string): Promise<BookingRecord> {
    const booking = await this.tenantDb.forTenant(tenantId, (tx) => this.bookings.findByCode(tx, code));
    if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    return booking;
  }

  /** Issue an OTP for a booking code and email it to the booking's customer (§8.6). */
  async requestOtp(tenantId: string, code: string): Promise<{ code: string; expiresInSec: number; devOtp?: string }> {
    const booking = await this.tenantDb.forTenant(tenantId, (tx) => this.bookings.findByCode(tx, code));
    if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    const { otp, expiresInSec } = await this.otp.issue(code);
    // Synchronous send — the plaintext OTP is never persisted, so it can't ride the
    // outbox. `sendBookingOtp` swallows its own delivery errors (the code stays valid).
    await this.notifier.sendBookingOtp(tenantId, booking.id, otp, expiresInSec);
    return { code, expiresInSec, ...(IS_PROD ? {} : { devOtp: otp }) };
  }

  /**
   * Resolve a booking for guest access: a matching session customer OR a valid
   * OTP authorizes it. Used by the view + cancel endpoints.
   */
  async resolveForAccess(
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
