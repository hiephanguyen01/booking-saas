import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { releasesUsageOnCancel } from '../../domain/entities/promo-redemption.entity';
import { PROMO_AGREEMENT_RECORDER } from '../../domain/ports/promo-agreement-recorder.port';
import { PROMOTION_REPOSITORY } from '../../domain/ports/promotion-repository.port';
import { PROMO_REDEMPTION_REPOSITORY } from '../../domain/ports/promo-redemption-repository.port';
import { PROMO_CONTEXT_LOOKUP } from '../../domain/ports/promo-context-lookup.port';
import { PrismaPromotionRepository } from '../repositories/prisma-promotion.repository';
import { PrismaPromoRedemptionRepository } from '../repositories/prisma-promo-redemption.repository';
import { PrismaPromoContextLookup } from '../repositories/prisma-promo-context.lookup';
import { PrismaPromoAgreementRecorder } from '../repositories/prisma-promo-agreement.recorder';
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
    { provide: PROMO_AGREEMENT_RECORDER, useClass: PrismaPromoAgreementRecorder },
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
  exports: [
    PreparePromotionUseCase,
    ReservePromotionUseCase,
    MarkPromotionAppliedUseCase,
    ReleasePromotionUseCase,
  ],
})
export class PromotionsModule implements OnModuleInit {
  private readonly logger = new Logger(PromotionsModule.name);

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
    this.registry.register('booking.confirmed', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.markPromotionApplied.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.expired', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.releasePromotion.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.rejected', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.releasePromotion.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.cancelled', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      const p = event.payload as { bookingId: string; refundPercent?: number };
      // §12.5: only a full refund returns the usage; a partial refund keeps it `applied`.
      if (!releasesUsageOnCancel(p.refundPercent)) return Promise.resolve();
      return this.releasePromotion.execute(tenantId, p.bookingId);
    });
  }

  /**
   * A tenant-scoped promo event without a tenant id cannot be routed: skip it (and
   * say so) instead of running `forTenant('')`, which crashes on the RLS policy's
   * uuid cast (`invalid input syntax for type uuid: ""`). Skipping — not throwing —
   * avoids wasting the event's finite retry budget and eventually dead-lettering a
   * structurally invalid row.
   */
  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}

function bookingIdOf(payload: unknown): string {
  return (payload as { bookingId: string }).bookingId;
}
