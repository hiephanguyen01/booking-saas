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
import { AuditModule } from './shared/audit/audit.module';
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
import { AffiliateModule } from './modules/affiliate/infrastructure/http/affiliate.module';
import { NotificationModule } from './modules/notification/infrastructure/http/notification.module';
import { AdministrativeDivisionModule } from './modules/administrative-division/infrastructure/http/administrative-division.module';
import { ReviewsModule } from './modules/reviews/infrastructure/http/reviews.module';

const prettyLogs =
  process.env.LOG_PRETTY === 'true' ||
  (process.env.LOG_PRETTY !== 'false' && process.env.NODE_ENV !== 'production');

@Module({
  imports: [
    // main.ts loads the one workspace-root `.env` before importing this module.
    // Ignore package-local dotenv files so configuration cannot silently drift.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.cookie', 'req.headers.authorization'],
        customSuccessMessage: (req, res, responseTime) =>
          `${req.method} ${req.url} → ${res.statusCode} (${responseTime}ms)`,
        customErrorMessage: (req, res, error) =>
          `${req.method} ${req.url} → ${res.statusCode}: ${error.message}`,
        transport: prettyLogs
          ? {
              target: require.resolve('pino-pretty'),
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname,context,req,res,responseTime',
                messageFormat: '{if context}{context} - {end}{msg}',
              },
            }
          : undefined,
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    TenantContextModule,
    OutboxModule,
    StorageModule,
    AuditModule,
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
    AffiliateModule,
    NotificationModule,
    AdministrativeDivisionModule,
    ReviewsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Validates @Body()/@Query() params typed with a createZodDto class; no-ops on
    // everything else. Coexists with the inline ZodValidationPipe on scalar @Params.
    { provide: APP_PIPE, useClass: ZodDtoValidationPipe },
  ],
})
export class AppModule {}
