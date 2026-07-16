import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { AFFILIATE_REPOSITORY } from '../../domain/ports/affiliate-repository.port';
import { REFERRAL_LINK_REPOSITORY } from '../../domain/ports/referral-link-repository.port';
import { AFFILIATE_COMMISSION_REPOSITORY } from '../../domain/ports/affiliate-commission-repository.port';
import { COMMISSION_RULE_READER } from '../../domain/ports/commission-rule-reader.port';
import { PrismaAffiliateRepository } from '../repositories/prisma-affiliate.repository';
import { PrismaReferralLinkRepository } from '../repositories/prisma-referral-link.repository';
import { PrismaAffiliateCommissionRepository } from '../repositories/prisma-affiliate-commission.repository';
import { PrismaCommissionRuleReader } from '../repositories/prisma-commission-rule.reader';
import { ResolveAttributionService } from '../../application/resolve-attribution.service';
import { RecordCommissionService } from '../../application/record-commission.service';
import { AffiliateContextService } from '../../application/affiliate-context.service';
import { ApplyAffiliateUseCase } from '../../application/use-cases/apply-affiliate.use-case';
import { ListAffiliateMembershipsUseCase } from '../../application/use-cases/list-affiliate-memberships.use-case';
import { UpdateAffiliatePayoutInfoUseCase } from '../../application/use-cases/update-affiliate-payout-info.use-case';
import { TrackReferralUseCase } from '../../application/use-cases/track-referral.use-case';
import { CreateReferralLinkUseCase } from '../../application/use-cases/create-referral-link.use-case';
import { ListAffiliateLinksUseCase } from '../../application/use-cases/list-affiliate-links.use-case';
import { DeleteReferralLinkUseCase } from '../../application/use-cases/delete-referral-link.use-case';
import { GetAffiliateStatsUseCase } from '../../application/use-cases/get-affiliate-stats.use-case';
import { ListAffiliateCommissionsUseCase } from '../../application/use-cases/list-affiliate-commissions.use-case';
import { ListTenantAffiliatesUseCase } from '../../application/use-cases/list-tenant-affiliates.use-case';
import { GetTenantAffiliateUseCase } from '../../application/use-cases/get-tenant-affiliate.use-case';
import { SetAffiliateStatusUseCase } from '../../application/use-cases/set-affiliate-status.use-case';
import { UpdateAffiliateRateUseCase } from '../../application/use-cases/update-affiliate-rate.use-case';
import { PublicReferralController } from './public-referral.controller';
import { AffiliateController } from './affiliate.controller';
import { TenantAffiliateController } from './tenant-affiliate.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [PublicReferralController, AffiliateController, TenantAffiliateController],
  providers: [
    { provide: AFFILIATE_REPOSITORY, useClass: PrismaAffiliateRepository },
    { provide: REFERRAL_LINK_REPOSITORY, useClass: PrismaReferralLinkRepository },
    { provide: AFFILIATE_COMMISSION_REPOSITORY, useClass: PrismaAffiliateCommissionRepository },
    { provide: COMMISSION_RULE_READER, useClass: PrismaCommissionRuleReader },
    ResolveAttributionService,
    RecordCommissionService,
    AffiliateContextService,
    ApplyAffiliateUseCase,
    ListAffiliateMembershipsUseCase,
    UpdateAffiliatePayoutInfoUseCase,
    TrackReferralUseCase,
    CreateReferralLinkUseCase,
    ListAffiliateLinksUseCase,
    DeleteReferralLinkUseCase,
    GetAffiliateStatsUseCase,
    ListAffiliateCommissionsUseCase,
    ListTenantAffiliatesUseCase,
    GetTenantAffiliateUseCase,
    SetAffiliateStatusUseCase,
    UpdateAffiliateRateUseCase,
  ],
  // Exported so the booking module can resolve attribution in-tx at booking creation.
  exports: [ResolveAttributionService],
})
export class AffiliateModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly commissions: RecordCommissionService,
  ) {}

  /**
   * Affiliate commission lifecycle (§7.8), driven by booking + payout events.
   * Handlers are at-least-once — every repo transition is idempotent (the row is
   * keyed by the unique booking_id), so redelivery is safe:
   *   confirmed → `pending`; completed → `confirmed`;
   *   cancelled/rejected/expired → `reversed`; refunded (dispute) → `clawed_back`;
   *   payout.paid (affiliate) → confirmed commissions become `paid`.
   */
  onModuleInit(): void {
    this.registry.register('booking.confirmed', (event) =>
      this.commissions.recordPending(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.completed', (event) =>
      this.commissions.recordConfirmed(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.cancelled', (event) =>
      this.commissions.reverse(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.rejected', (event) =>
      this.commissions.reverse(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.expired', (event) =>
      this.commissions.reverse(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.refunded', (event) =>
      this.commissions.clawback(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('payout.paid', (event) => {
      const p = event.payload as { payeeType?: string; payeeId?: string };
      if (p.payeeType !== 'affiliate' || !p.payeeId) return Promise.resolve();
      return this.commissions.markPaid(event.tenantId ?? '', p.payeeId);
    });
  }
}

function bookingIdOf(payload: unknown): string {
  return (payload as { bookingId: string }).bookingId;
}
