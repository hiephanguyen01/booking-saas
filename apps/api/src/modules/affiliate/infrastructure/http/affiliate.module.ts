import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { AFFILIATE_ATTRIBUTION_READER } from '../../domain/ports/affiliate-attribution-reader.port';
import { AFFILIATE_READER } from '../../domain/ports/affiliate-reader.port';
import { AFFILIATE_REPOSITORY } from '../../domain/ports/affiliate-repository.port';
import { REFERRAL_LINK_READER } from '../../domain/ports/referral-link-reader.port';
import { REFERRAL_LINK_REPOSITORY } from '../../domain/ports/referral-link-repository.port';
import { AFFILIATE_COMMISSION_READER } from '../../domain/ports/affiliate-commission-reader.port';
import { AFFILIATE_COMMISSION_REPOSITORY } from '../../domain/ports/affiliate-commission-repository.port';
import { COMMISSION_RULE_READER } from '../../domain/ports/commission-rule-reader.port';
import { PrismaAffiliateRepository } from '../repositories/prisma-affiliate.repository';
import { PrismaAffiliateAttributionReader } from '../repositories/prisma-affiliate-attribution.reader';
import { PrismaReferralLinkRepository } from '../repositories/prisma-referral-link.repository';
import { PrismaAffiliateCommissionRepository } from '../repositories/prisma-affiliate-commission.repository';
import { PrismaCommissionRuleReader } from '../repositories/prisma-commission-rule.reader';
import { ResolveAttributionUseCase } from '../../application/use-cases/resolve-attribution.use-case';
import { RecordPendingCommissionUseCase } from '../../application/use-cases/record-pending-commission.use-case';
import { RecordConfirmedCommissionUseCase } from '../../application/use-cases/record-confirmed-commission.use-case';
import { ReverseCommissionUseCase } from '../../application/use-cases/reverse-commission.use-case';
import { ClawbackCommissionUseCase } from '../../application/use-cases/clawback-commission.use-case';
import { MarkCommissionsPaidUseCase } from '../../application/use-cases/mark-commissions-paid.use-case';
import { GetAffiliateMembershipsUseCase } from '../../application/use-cases/get-affiliate-memberships.use-case';
import { RequireApprovedAffiliateUseCase } from '../../application/use-cases/require-approved-affiliate.use-case';
import { RequireAffiliateMembershipUseCase } from '../../application/use-cases/require-affiliate-membership.use-case';
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
    PrismaAffiliateRepository,
    { provide: AFFILIATE_REPOSITORY, useExisting: PrismaAffiliateRepository },
    { provide: AFFILIATE_READER, useExisting: PrismaAffiliateRepository },
    PrismaReferralLinkRepository,
    { provide: REFERRAL_LINK_REPOSITORY, useExisting: PrismaReferralLinkRepository },
    { provide: REFERRAL_LINK_READER, useExisting: PrismaReferralLinkRepository },
    {
      provide: AFFILIATE_ATTRIBUTION_READER,
      useClass: PrismaAffiliateAttributionReader,
    },
    PrismaAffiliateCommissionRepository,
    {
      provide: AFFILIATE_COMMISSION_REPOSITORY,
      useExisting: PrismaAffiliateCommissionRepository,
    },
    {
      provide: AFFILIATE_COMMISSION_READER,
      useExisting: PrismaAffiliateCommissionRepository,
    },
    { provide: COMMISSION_RULE_READER, useClass: PrismaCommissionRuleReader },
    ResolveAttributionUseCase,
    RecordPendingCommissionUseCase,
    RecordConfirmedCommissionUseCase,
    ReverseCommissionUseCase,
    ClawbackCommissionUseCase,
    MarkCommissionsPaidUseCase,
    GetAffiliateMembershipsUseCase,
    RequireApprovedAffiliateUseCase,
    RequireAffiliateMembershipUseCase,
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
  exports: [ResolveAttributionUseCase],
})
export class AffiliateModule implements OnModuleInit {
  private readonly logger = new Logger(AffiliateModule.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly recordPending: RecordPendingCommissionUseCase,
    private readonly recordConfirmed: RecordConfirmedCommissionUseCase,
    private readonly reverseCommission: ReverseCommissionUseCase,
    private readonly clawbackCommission: ClawbackCommissionUseCase,
    private readonly markCommissionsPaid: MarkCommissionsPaidUseCase,
  ) {}

  /**
   * Affiliate commission lifecycle (§7.8), driven by booking + payout events.
   * Handlers are at-least-once. Missing/ineligible business state is an
   * idempotent no-op in the use-cases; infrastructure failures are not swallowed
   * and therefore retry. An unroutable event with no tenant id is logged and
   * skipped before it can reach the RLS transaction:
   *   confirmed → `pending`; completed → `confirmed`;
   *   cancelled/rejected/expired → `reversed`; refunded (dispute) → `clawed_back`;
   *   payout.paid (affiliate) → confirmed commissions become `paid`.
   */
  onModuleInit(): void {
    this.registry.register('booking.confirmed', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.recordPending.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.completed', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.recordConfirmed.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.cancelled', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.reverseCommission.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.rejected', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.reverseCommission.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.expired', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.reverseCommission.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.refunded', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.clawbackCommission.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('payout.paid', (event) => {
      const p = event.payload as { payeeType?: string; payeeId?: string };
      if (p.payeeType !== 'affiliate' || !p.payeeId) return Promise.resolve();
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.markCommissionsPaid.execute(tenantId, p.payeeId);
    });
  }

  /**
   * A tenant-scoped affiliate event without a tenant id cannot be routed: skip it
   * (and say so) instead of running `forTenant('')`, which crashes on the RLS
   * policy's uuid cast and parks the event in permanent retry. Skipping — not
   * throwing — keeps the at-least-once relay moving without a dead-letter queue.
   */
  private requireTenantId(
    eventType: string,
    tenantId: string | null,
  ): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}

function bookingIdOf(payload: unknown): string {
  return (payload as { bookingId: string }).bookingId;
}
