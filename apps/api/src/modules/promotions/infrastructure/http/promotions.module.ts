import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { AGREEMENT_REPOSITORY } from '../../../partner/domain/ports/agreement-repository.port';
import { PrismaAgreementRepository } from '../../../partner/infrastructure/repositories/prisma-agreement.repository';
import { PROMOTION_REPOSITORY } from '../../domain/ports/promotion-repository.port';
import { PROMO_REDEMPTION_REPOSITORY } from '../../domain/ports/promo-redemption-repository.port';
import { PROMO_CONTEXT_LOOKUP } from '../../domain/ports/promo-context-lookup.port';
import { PrismaPromotionRepository } from '../repositories/prisma-promotion.repository';
import { PrismaPromoRedemptionRepository } from '../repositories/prisma-promo-redemption.repository';
import { PrismaPromoContextLookup } from '../repositories/prisma-promo-context-lookup';
import { PreparePromotionUseCase } from '../../application/use-cases/prepare-promotion.use-case';
import { ReservePromotionUseCase } from '../../application/use-cases/reserve-promotion.use-case';
import { MarkPromotionAppliedUseCase } from '../../application/use-cases/mark-promotion-applied.use-case';
import { ReleasePromotionUseCase } from '../../application/use-cases/release-promotion.use-case';
import { ValidatePromoUseCase } from '../../application/use-cases/validate-promo.use-case';
import { ResolveAutoCampaignUseCase } from '../../application/use-cases/resolve-auto-campaign.use-case';
import { CreatePromotionUseCase } from '../../application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from '../../application/use-cases/update-promotion.use-case';
import { EndPromotionUseCase } from '../../application/use-cases/end-promotion.use-case';
import { GetPromotionUseCase } from '../../application/use-cases/get-promotion.use-case';
import { GetPartnerPromotionUseCase } from '../../application/use-cases/get-partner-promotion.use-case';
import { ListPromotionCategoriesUseCase } from '../../application/use-cases/list-promotion-categories.use-case';
import { ListPromotionsUseCase } from '../../application/use-cases/list-promotions.use-case';
import { PromoUsageStatsUseCase } from '../../application/use-cases/promo-usage-stats.use-case';
import { CreatePartnerPromotionUseCase } from '../../application/use-cases/create-partner-promotion.use-case';
import { UpdatePartnerPromotionUseCase } from '../../application/use-cases/update-partner-promotion.use-case';
import { EndPartnerPromotionUseCase } from '../../application/use-cases/end-partner-promotion.use-case';
import { ListPartnerPromotionsUseCase } from '../../application/use-cases/list-partner-promotions.use-case';
import { ListPendingOptInUseCase } from '../../application/use-cases/list-pending-optin.use-case';
import { OptInPromotionUseCase } from '../../application/use-cases/opt-in-promotion.use-case';
import { PublicPromoController } from './public-promo.controller';
import { TenantPromotionController } from './tenant-promotion.controller';
import { PartnerPromotionController } from './partner-promotion.controller';
import { PartnerPromotionsEnabledGuard } from './guards/partner-promotions-enabled.guard';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [PublicPromoController, TenantPromotionController, PartnerPromotionController],
  providers: [
    { provide: PROMOTION_REPOSITORY, useClass: PrismaPromotionRepository },
    { provide: PROMO_REDEMPTION_REPOSITORY, useClass: PrismaPromoRedemptionRepository },
    { provide: PROMO_CONTEXT_LOOKUP, useClass: PrismaPromoContextLookup },
    { provide: AGREEMENT_REPOSITORY, useClass: PrismaAgreementRepository },
    PreparePromotionUseCase,
    ReservePromotionUseCase,
    MarkPromotionAppliedUseCase,
    ReleasePromotionUseCase,
    ValidatePromoUseCase,
    ResolveAutoCampaignUseCase,
    CreatePromotionUseCase,
    UpdatePromotionUseCase,
    EndPromotionUseCase,
    GetPromotionUseCase,
    ListPromotionCategoriesUseCase,
    ListPromotionsUseCase,
    PromoUsageStatsUseCase,
    CreatePartnerPromotionUseCase,
    UpdatePartnerPromotionUseCase,
    EndPartnerPromotionUseCase,
    GetPartnerPromotionUseCase,
    ListPartnerPromotionsUseCase,
    ListPendingOptInUseCase,
    OptInPromotionUseCase,
    PartnerPromotionsEnabledGuard,
  ],
  // Exported so the booking module can prepare + reserve a redemption in-tx at booking creation
  // (and drive the applied/released lifecycle transitions).
  exports: [PreparePromotionUseCase, ReservePromotionUseCase, MarkPromotionAppliedUseCase, ReleasePromotionUseCase],
})
export class PromotionsModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly markPromotionApplied: MarkPromotionAppliedUseCase,
    private readonly releasePromotion: ReleasePromotionUseCase,
  ) {}

  /**
   * Redemption lifecycle (§12.3). Handlers are at-least-once — every underlying
   * repo transition is idempotent, so redelivery is safe:
   *   confirmed → `applied`; expired/rejected/100%-refund-cancel → `released`.
   */
  onModuleInit(): void {
    this.registry.register('booking.confirmed', (event) =>
      this.markPromotionApplied.execute(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.expired', (event) =>
      this.releasePromotion.execute(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.rejected', (event) =>
      this.releasePromotion.execute(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.cancelled', (event) => {
      const p = event.payload as { bookingId: string; refundPercent?: number };
      // Only a full refund returns the usage; a partial refund keeps it `applied` (§12.5).
      if (p.refundPercent === 100) return this.releasePromotion.execute(event.tenantId ?? '', p.bookingId);
      return Promise.resolve();
    });
  }
}

function bookingIdOf(payload: unknown): string {
  return (payload as { bookingId: string }).bookingId;
}
