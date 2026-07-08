import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './shared/health/health.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { TenantContextModule } from './shared/tenant-context/tenant-context.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { IdentityAccessModule } from './modules/identity-access/infrastructure/http/identity-access.module';
import { TenancyModule } from './modules/tenancy/infrastructure/http/tenancy.module';
import { PartnerModule } from './modules/partner/infrastructure/http/partner.module';
import { CatalogModule } from './modules/catalog/infrastructure/http/catalog.module';
import { ListingModule } from './modules/listing/infrastructure/http/listing.module';

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
    HealthModule,
    IdentityAccessModule,
    TenancyModule,
    PartnerModule,
    CatalogModule,
    ListingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
