import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { PROMOTION_REPOSITORY } from '../../domain/ports/promotion-repository.port';
import { PROMO_REDEMPTION_REPOSITORY } from '../../domain/ports/promo-redemption-repository.port';
import { PrismaPromotionRepository } from '../repositories/prisma-promotion.repository';
import { PrismaPromoRedemptionRepository } from '../repositories/prisma-promo-redemption.repository';
import { ApplyPromotionService } from '../../application/apply-promotion.service';
import { ValidatePromoUseCase } from '../../application/use-cases/validate-promo.use-case';
import { CreatePromotionUseCase } from '../../application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from '../../application/use-cases/update-promotion.use-case';
import { EndPromotionUseCase } from '../../application/use-cases/end-promotion.use-case';
import { ListPromotionsUseCase } from '../../application/use-cases/list-promotions.use-case';
import { PromoUsageStatsUseCase } from '../../application/use-cases/promo-usage-stats.use-case';
import { PublicPromoController } from './public-promo.controller';
import { TenantPromotionController } from './tenant-promotion.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [PublicPromoController, TenantPromotionController],
  providers: [
    { provide: PROMOTION_REPOSITORY, useClass: PrismaPromotionRepository },
    { provide: PROMO_REDEMPTION_REPOSITORY, useClass: PrismaPromoRedemptionRepository },
    ApplyPromotionService,
    ValidatePromoUseCase,
    CreatePromotionUseCase,
    UpdatePromotionUseCase,
    EndPromotionUseCase,
    ListPromotionsUseCase,
    PromoUsageStatsUseCase,
  ],
  // Exported so the booking module can reserve a redemption in-tx at booking creation.
  exports: [ApplyPromotionService],
})
export class PromotionsModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly apply: ApplyPromotionService,
  ) {}

  /**
   * Redemption lifecycle (§12.3). Handlers are at-least-once — every underlying
   * repo transition is idempotent, so redelivery is safe:
   *   confirmed → `applied`; expired/rejected/100%-refund-cancel → `released`.
   */
  onModuleInit(): void {
    this.registry.register('booking.confirmed', (event) =>
      this.apply.markApplied(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.expired', (event) =>
      this.apply.release(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.rejected', (event) =>
      this.apply.release(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.cancelled', (event) => {
      const p = event.payload as { bookingId: string; refundPercent?: number };
      // Only a full refund returns the usage; a partial refund keeps it `applied` (§12.5).
      if (p.refundPercent === 100) return this.apply.release(event.tenantId ?? '', p.bookingId);
      return Promise.resolve();
    });
  }
}

function bookingIdOf(payload: unknown): string {
  return (payload as { bookingId: string }).bookingId;
}
