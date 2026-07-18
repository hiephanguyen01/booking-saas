import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { ListingModule } from '../../../listing/infrastructure/http/listing.module';
import { AVAILABILITY_RULE_REPOSITORY } from '../../domain/ports/availability-rule-repository.port';
import { AVAILABILITY_EXCEPTION_REPOSITORY } from '../../domain/ports/availability-exception-repository.port';
import { BUSY_READER } from '../../domain/ports/busy-reader.port';
import { HOLD_READER } from '../../domain/ports/hold-reader.port';
import {
  AVAILABILITY_CACHE,
  type IAvailabilityCache,
} from '../../domain/ports/availability-cache.port';
import { PrismaAvailabilityRuleRepository } from '../repositories/prisma-availability-rule.repository';
import { PrismaAvailabilityExceptionRepository } from '../repositories/prisma-availability-exception.repository';
import { PrismaBusyReader } from '../repositories/prisma-busy-reader';
import { RedisHoldReader } from '../repositories/redis-hold-reader';
import { RedisAvailabilityCache } from '../redis-availability-cache';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { ListAvailabilityRulesUseCase } from '../../application/use-cases/list-availability-rules.use-case';
import { SetAvailabilityRulesUseCase } from '../../application/use-cases/set-availability-rules.use-case';
import { ListAvailabilityExceptionsUseCase } from '../../application/use-cases/list-availability-exceptions.use-case';
import { AddAvailabilityExceptionUseCase } from '../../application/use-cases/add-availability-exception.use-case';
import { DeleteAvailabilityExceptionUseCase } from '../../application/use-cases/delete-availability-exception.use-case';
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
    { provide: AVAILABILITY_CACHE, useClass: RedisAvailabilityCache },
    GetAvailabilityUseCase,
    ListAvailabilityRulesUseCase,
    SetAvailabilityRulesUseCase,
    ListAvailabilityExceptionsUseCase,
    AddAvailabilityExceptionUseCase,
    DeleteAvailabilityExceptionUseCase,
  ],
})
export class SchedulingModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    @Inject(AVAILABILITY_CACHE) private readonly cache: IAvailabilityCache,
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
        return this.cache.invalidateByBooking(event.tenantId ?? '', bookingId);
      });
    }
    for (const eventType of ['pricing_rule.created', 'pricing_rule.deleted']) {
      this.registry.register(eventType, (event) => {
        const { listingId } = event.payload as { listingId: string };
        return this.cache.invalidateListing(listingId);
      });
    }
  }
}
