import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { ListingModule } from '../../../listing/infrastructure/http/listing.module';
import { IdentityAccessModule } from '../../../identity-access/infrastructure/http/identity-access.module';
import { PromotionsModule } from '../../../promotions/infrastructure/http/promotions.module';
import { FinanceModule } from '../../../finance/infrastructure/http/finance.module';
import { AffiliateModule } from '../../../affiliate/infrastructure/http/affiliate.module';
import { NotificationModule } from '../../../notification/infrastructure/http/notification.module';
import { BOOKING_REPOSITORY } from '../../domain/ports/booking-repository.port';
import { HOLD_STORE } from '../../domain/ports/hold-store.port';
import { OTP_STORE } from '../../domain/ports/otp-store.port';
import { BOOKING_AVAILABILITY_READER } from '../../domain/ports/booking-availability-reader.port';
import { PrismaBookingRepository } from '../repositories/prisma-booking.repository';
import { PrismaBookingAvailabilityReader } from '../repositories/prisma-booking-availability-reader';
import { RedisHoldStore } from '../redis-hold.store';
import { RedisOtpStore } from '../redis-otp.store';
import { BookingSchedulerWorker } from '../booking-scheduler.worker';
import { CreateBookingUseCase } from '../../application/use-cases/create-booking.use-case';
import { ConfirmBookingUseCase } from '../../application/use-cases/confirm-booking.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { ApproveBookingUseCase } from '../../application/use-cases/approve-booking.use-case';
import { RejectBookingUseCase } from '../../application/use-cases/reject-booking.use-case';
import { MarkNoShowUseCase } from '../../application/use-cases/mark-no-show.use-case';
import { MarkPickedUpUseCase } from '../../application/use-cases/mark-picked-up.use-case';
import { MarkReturnedUseCase } from '../../application/use-cases/mark-returned.use-case';
import { ListMyBookingsUseCase } from '../../application/use-cases/list-my-bookings.use-case';
import { GetBookingByCodeUseCase } from '../../application/use-cases/get-booking-by-code.use-case';
import { RequestBookingOtpUseCase } from '../../application/use-cases/request-booking-otp.use-case';
import { ResolveBookingAccessUseCase } from '../../application/use-cases/resolve-booking-access.use-case';
import { PartnerCalendarUseCase } from '../../application/use-cases/partner-calendar.use-case';
import { ListTenantBookingsUseCase } from '../../application/use-cases/list-tenant-bookings.use-case';
import { PartnerBookingStatsUseCase } from '../../application/use-cases/partner-booking-stats.use-case';
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
import { GetBookingHistoryUseCase } from '../../application/use-cases/get-booking-history.use-case';
import { UpdatePartnerNoteUseCase } from '../../application/use-cases/update-partner-note.use-case';
import { PublicBookingController } from './public-booking.controller';
import { PartnerBookingController } from './partner-booking.controller';
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
  ],
  controllers: [PublicBookingController, PartnerBookingController, TenantBookingController],
  providers: [
    { provide: BOOKING_REPOSITORY, useClass: PrismaBookingRepository },
    { provide: HOLD_STORE, useClass: RedisHoldStore },
    { provide: OTP_STORE, useClass: RedisOtpStore },
    { provide: BOOKING_AVAILABILITY_READER, useClass: PrismaBookingAvailabilityReader },
    CreateBookingUseCase,
    ConfirmBookingUseCase,
    CancelBookingUseCase,
    ApproveBookingUseCase,
    RejectBookingUseCase,
    MarkNoShowUseCase,
    MarkPickedUpUseCase,
    MarkReturnedUseCase,
    ListMyBookingsUseCase,
    GetBookingByCodeUseCase,
    RequestBookingOtpUseCase,
    ResolveBookingAccessUseCase,
    PartnerCalendarUseCase,
    ListTenantBookingsUseCase,
    PartnerBookingStatsUseCase,
    GetBookingUseCase,
    GetBookingHistoryUseCase,
    UpdatePartnerNoteUseCase,
    BookingSchedulerWorker,
  ],
  // Exported so Task 1.9 (payments) can confirm a booking + read it for checkout/status.
  exports: [ConfirmBookingUseCase, BOOKING_REPOSITORY],
})
export class BookingModule {}
