import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { ListingModule } from '../../../listing/infrastructure/http/listing.module';
import { IdentityAccessModule } from '../../../identity-access/infrastructure/http/identity-access.module';
import { BOOKING_REPOSITORY } from '../../domain/ports/booking-repository.port';
import { HOLD_STORE } from '../../domain/ports/hold-store.port';
import { OTP_STORE } from '../../domain/ports/otp-store.port';
import { PrismaBookingRepository } from '../repositories/prisma-booking.repository';
import { RedisHoldStore } from '../redis-hold.store';
import { RedisOtpStore } from '../redis-otp.store';
import { BookingSchedulerWorker } from '../booking-scheduler.worker';
import { CreateBookingUseCase } from '../../application/use-cases/create-booking.use-case';
import { ConfirmBookingUseCase } from '../../application/use-cases/confirm-booking.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { PartnerBookingUseCase } from '../../application/use-cases/partner-booking.use-case';
import { InventoryFulfillmentUseCase } from '../../application/use-cases/inventory-fulfillment.use-case';
import { BookingLookupUseCase } from '../../application/use-cases/booking-lookup.use-case';
import { PublicBookingController } from './public-booking.controller';
import { PartnerBookingController } from './partner-booking.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule, ListingModule, IdentityAccessModule],
  controllers: [PublicBookingController, PartnerBookingController],
  providers: [
    { provide: BOOKING_REPOSITORY, useClass: PrismaBookingRepository },
    { provide: HOLD_STORE, useClass: RedisHoldStore },
    { provide: OTP_STORE, useClass: RedisOtpStore },
    CreateBookingUseCase,
    ConfirmBookingUseCase,
    CancelBookingUseCase,
    PartnerBookingUseCase,
    InventoryFulfillmentUseCase,
    BookingLookupUseCase,
    BookingSchedulerWorker,
  ],
  // Exported so Task 1.9 (payments) can confirm a booking from the gateway webhook.
  exports: [ConfirmBookingUseCase],
})
export class BookingModule {}
