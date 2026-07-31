import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { AffiliateModule } from '../../../affiliate/infrastructure/http/affiliate.module';
import { FinanceModule } from '../../../finance/infrastructure/http/finance.module';
import { IdentityAccessModule } from '../../../identity-access/infrastructure/http/identity-access.module';
import { LegalModule } from '../../../legal/infrastructure/http/legal.module';
import { ListingModule } from '../../../listing/infrastructure/http/listing.module';
import { NotificationModule } from '../../../notification/infrastructure/http/notification.module';
import { PromotionsModule } from '../../../promotions/infrastructure/http/promotions.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { ApproveBookingUseCase } from '../../application/use-cases/approve-booking.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { ConfirmBookingUseCase } from '../../application/use-cases/confirm-booking.use-case';
import { CreateBookingUseCase } from '../../application/use-cases/create-booking.use-case';
import { FinalizeRefundedBookingUseCase } from '../../application/use-cases/finalize-refunded-booking.use-case';
import { GetBookingByCodeUseCase } from '../../application/use-cases/get-booking-by-code.use-case';
import { GetBookingHistoryUseCase } from '../../application/use-cases/get-booking-history.use-case';
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
import { ListMyBookingsUseCase } from '../../application/use-cases/list-my-bookings.use-case';
import { ListTenantBookingsUseCase } from '../../application/use-cases/list-tenant-bookings.use-case';
import { MarkCompletedUseCase } from '../../application/use-cases/mark-completed.use-case';
import { MarkNoShowUseCase } from '../../application/use-cases/mark-no-show.use-case';
import { MarkPickedUpUseCase } from '../../application/use-cases/mark-picked-up.use-case';
import { MarkReturnedUseCase } from '../../application/use-cases/mark-returned.use-case';
import { PartnerBookingStatsUseCase } from '../../application/use-cases/partner-booking-stats.use-case';
import { PartnerCalendarUseCase } from '../../application/use-cases/partner-calendar.use-case';
import { RejectBookingUseCase } from '../../application/use-cases/reject-booking.use-case';
import { RequestBookingOtpUseCase } from '../../application/use-cases/request-booking-otp.use-case';
import { IssueBookingAccessGrantUseCase } from '../../application/use-cases/issue-booking-access-grant.use-case';
import { ResolveBookingAccessUseCase } from '../../application/use-cases/resolve-booking-access.use-case';
import { UpdatePartnerNoteUseCase } from '../../application/use-cases/update-partner-note.use-case';
import { BOOKING_ACCESS_GRANT_STORE } from '../../domain/ports/booking-access-grant-store.port';
import { BOOKING_AVAILABILITY_READER } from '../../domain/ports/booking-availability-reader.port';
import { BOOKING_PARTNER_READER } from '../../domain/ports/booking-partner-reader.port';
import { BOOKING_REPOSITORY } from '../../domain/ports/booking-repository.port';
import { HOLD_STORE } from '../../domain/ports/hold-store.port';
import { OTP_STORE } from '../../domain/ports/otp-store.port';
import { BookingSchedulerWorker } from '../booking-scheduler.worker';
import { RedisBookingAccessGrantStore } from '../redis-booking-access-grant.store';
import { RedisHoldStore } from '../redis-hold.store';
import { RedisOtpStore } from '../redis-otp.store';
import { PrismaBookingAvailabilityReader } from '../repositories/prisma-booking-availability.reader';
import { PrismaBookingPartnerReader } from '../repositories/prisma-booking-partner.reader';
import { PrismaBookingRepository } from '../repositories/prisma-booking.repository';
import { PartnerBookingController } from './partner-booking.controller';
import { PublicBookingController } from './public-booking.controller';
import { TenantBookingController } from './tenant-booking.controller';

@Module({
  imports: [
    PrismaModule,
    TenantContextModule,
    TenancyModule,
    ListingModule,
    IdentityAccessModule,
    PromotionsModule,
    FinanceModule,
    AffiliateModule,
    NotificationModule,
    LegalModule,
  ],
  controllers: [PublicBookingController, PartnerBookingController, TenantBookingController],
  providers: [
    { provide: BOOKING_REPOSITORY, useClass: PrismaBookingRepository },
    { provide: HOLD_STORE, useClass: RedisHoldStore },
    { provide: OTP_STORE, useClass: RedisOtpStore },
    { provide: BOOKING_ACCESS_GRANT_STORE, useClass: RedisBookingAccessGrantStore },
    { provide: BOOKING_AVAILABILITY_READER, useClass: PrismaBookingAvailabilityReader },
    { provide: BOOKING_PARTNER_READER, useClass: PrismaBookingPartnerReader },
    CreateBookingUseCase,
    ConfirmBookingUseCase,
    CancelBookingUseCase,
    ApproveBookingUseCase,
    RejectBookingUseCase,
    MarkNoShowUseCase,
    MarkPickedUpUseCase,
    MarkReturnedUseCase,
    MarkCompletedUseCase,
    ListMyBookingsUseCase,
    GetBookingByCodeUseCase,
    RequestBookingOtpUseCase,
    IssueBookingAccessGrantUseCase,
    ResolveBookingAccessUseCase,
    PartnerCalendarUseCase,
    ListTenantBookingsUseCase,
    PartnerBookingStatsUseCase,
    GetBookingUseCase,
    GetBookingHistoryUseCase,
    UpdatePartnerNoteUseCase,
    FinalizeRefundedBookingUseCase,
    BookingSchedulerWorker,
  ],
  exports: [ResolveBookingAccessUseCase],
})
export class BookingModule implements OnModuleInit {
  private readonly logger = new Logger(BookingModule.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly finalizeRefundedBooking: FinalizeRefundedBookingUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register('payment.succeeded', async (event) => {
      const payload = event.payload as { bookingId: string; skipBookingConfirmation?: boolean };
      if (payload.skipBookingConfirmation === true) return;
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return;
      await this.confirmBooking.execute(tenantId, payload.bookingId);
    });
    this.registry.register('refund.completed', async (event) => {
      const payload = event.payload as { bookingId: string; affectsBookingStatus?: boolean };
      if (payload.affectsBookingStatus === false) return;
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return;
      await this.finalizeRefundedBooking.execute(tenantId, payload.bookingId);
    });
  }

  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.error(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}
