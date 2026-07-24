import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import {
  BOOKING_REPOSITORY,
  type BookingStatusHistoryRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';

/**
 * A booking's transition audit trail (§8.2) — every status change with its actor
 * and the reason typed at the time (e.g. why the customer cancelled).
 *
 * Ownership: tenant scope reads any of its bookings; partner scope must own the
 * booking (`partnerId`), and a mismatch resolves to **404, not 403**, so a partner
 * cannot probe for the existence of another partner's booking ids — the same rule
 * `GetBookingUseCase` applies.
 */
@Injectable()
export class GetBookingHistoryUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    bookingId: string,
    opts: { partnerId?: string } = {},
  ): Promise<BookingStatusHistoryRecord[]> {
    // One forTenant for the whole operation: the ownership read and the history
    // read share the tenant-scoped transaction.
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking || (opts.partnerId && booking.partnerId !== opts.partnerId)) {
        throw new BookingNotFound();
      }
      return this.bookings.listStatusHistory(tx, bookingId);
    });
  }
}
