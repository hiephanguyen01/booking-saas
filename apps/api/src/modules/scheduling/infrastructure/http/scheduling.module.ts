import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { ListingModule } from '../../../listing/infrastructure/http/listing.module';
import { AVAILABILITY_RULE_REPOSITORY } from '../../domain/ports/availability-rule-repository.port';
import { AVAILABILITY_EXCEPTION_REPOSITORY } from '../../domain/ports/availability-exception-repository.port';
import { BUSY_READER } from '../../domain/ports/busy-reader.port';
import { HOLD_READER } from '../../domain/ports/hold-reader.port';
import { PrismaAvailabilityRuleRepository } from '../repositories/prisma-availability-rule.repository';
import { PrismaAvailabilityExceptionRepository } from '../repositories/prisma-availability-exception.repository';
import { PrismaBusyReader } from '../repositories/prisma-busy-reader';
import { RedisHoldReader } from '../repositories/redis-hold-reader';
import { AvailabilityCache } from '../availability-cache';
import { AvailabilityCacheInvalidator } from '../../application/availability-cache-invalidator';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { ManageAvailabilityUseCase } from '../../application/use-cases/manage-availability.use-case';
import { PublicAvailabilityController } from './public-availability.controller';
import { TenantAvailabilityController } from './tenant-availability.controller';
import { PartnerAvailabilityController } from './partner-availability.controller';

/** Booking lifecycle events that change a resource's booking-derived busy set (§9.1). */
const BOOKING_BUSY_EVENTS = [
  'booking.created',
  'booking.confirmed',
  'booking.expired',
  'booking.rejected',
  'booking.cancelled',
  'booking.completed',
  'booking.returned',
  'booking.no_show',
] as const;

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule, ListingModule],
  controllers: [
    PublicAvailabilityController,
    TenantAvailabilityController,
    PartnerAvailabilityController,
  ],
  providers: [
    { provide: AVAILABILITY_RULE_REPOSITORY, useClass: PrismaAvailabilityRuleRepository },
    { provide: AVAILABILITY_EXCEPTION_REPOSITORY, useClass: PrismaAvailabilityExceptionRepository },
    { provide: BUSY_READER, useClass: PrismaBusyReader },
    { provide: HOLD_READER, useClass: RedisHoldReader },
    AvailabilityCache,
    AvailabilityCacheInvalidator,
    GetAvailabilityUseCase,
    ManageAvailabilityUseCase,
  ],
})
export class SchedulingModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly invalidator: AvailabilityCacheInvalidator,
  ) {}

  /**
   * Invalidate the resource-scoped availability cache whenever a booking's status
   * changes its busy set — subscribed via the outbox, never by importing the
   * booking module. Handlers are idempotent (a delete is safe to repeat), so
   * at-least-once redelivery is harmless.
   */
  onModuleInit(): void {
    for (const eventType of BOOKING_BUSY_EVENTS) {
      this.registry.register(eventType, (event) => {
        const { bookingId } = event.payload as { bookingId: string };
        return this.invalidator.invalidateByBooking(event.tenantId ?? '', bookingId);
      });
    }
  }
}
