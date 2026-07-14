import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodDtoValidationPipe } from './shared/validation/zod-dto-validation.pipe';
import { HealthModule } from './shared/health/health.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { TenantContextModule } from './shared/tenant-context/tenant-context.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { StorageModule } from './shared/storage/storage.module';
import { IdentityAccessModule } from './modules/identity-access/infrastructure/http/identity-access.module';
import { TenancyModule } from './modules/tenancy/infrastructure/http/tenancy.module';
import { PartnerModule } from './modules/partner/infrastructure/http/partner.module';
import { CatalogModule } from './modules/catalog/infrastructure/http/catalog.module';
import { ListingModule } from './modules/listing/infrastructure/http/listing.module';
import { SchedulingModule } from './modules/scheduling/infrastructure/http/scheduling.module';
import { BookingModule } from './modules/booking/infrastructure/http/booking.module';
import { PaymentsModule } from './modules/payments/infrastructure/http/payments.module';
import { PromotionsModule } from './modules/promotions/infrastructure/http/promotions.module';
import { FinanceModule } from './modules/finance/infrastructure/http/finance.module';
import { NotificationModule } from './modules/notification/infrastructure/http/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.cookie', 'req.headers.authorization'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    TenantContextModule,
    OutboxModule,
    StorageModule,
    HealthModule,
    IdentityAccessModule,
    TenancyModule,
    PartnerModule,
    CatalogModule,
    ListingModule,
    SchedulingModule,
    BookingModule,
    PaymentsModule,
    PromotionsModule,
    FinanceModule,
    NotificationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Validates @Body()/@Query() params typed with a createZodDto class; no-ops on
    // everything else. Coexists with the inline ZodValidationPipe on scalar @Params.
    { provide: APP_PIPE, useClass: ZodDtoValidationPipe },
  ],
})
export class AppModule {}
