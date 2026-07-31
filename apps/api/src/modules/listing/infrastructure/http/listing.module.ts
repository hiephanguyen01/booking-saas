import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { LegalModule } from '../../../legal/infrastructure/http/legal.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { CatalogModule } from '../../../catalog/infrastructure/http/catalog.module';
import { PartnerModule } from '../../../partner/infrastructure/http/partner.module';
import { AdministrativeDivisionModule } from '../../../administrative-division/infrastructure/http/administrative-division.module';
import { COMMISSION_COVERAGE_READER } from '../../domain/ports/commission-coverage-reader.port';
import { REVIEW_AGGREGATE_PROJECTOR } from '../../domain/ports/review-aggregate-projector.port';
import { PrismaCommissionCoverageReader } from '../repositories/prisma-commission-coverage.reader';
import { PrismaReviewAggregateProjector } from '../repositories/prisma-review-aggregate.projector';
import { AssertListingDepositCoverageUseCase } from '../../application/use-cases/assert-listing-deposit-coverage.use-case';
import { LISTING_GROUP_REPOSITORY } from '../../domain/ports/listing-group-repository.port';
import { LISTING_FEED_REPOSITORY } from '../../domain/ports/listing-feed-repository.port';
import { LISTING_REPOSITORY } from '../../domain/ports/listing-repository.port';
import { LISTING_REVISION_REPOSITORY } from '../../domain/ports/listing-revision-repository.port';
import { RESOURCE_REPOSITORY } from '../../domain/ports/resource-repository.port';
import { PRICING_RULE_REPOSITORY } from '../../domain/ports/pricing-rule-repository.port';
import { OPEN_HOURS_READER } from '../../domain/ports/open-hours-reader.port';
import { CANCELLATION_POLICY_REPOSITORY } from '../../domain/ports/cancellation-policy-repository.port';
import { PrismaListingGroupRepository } from '../repositories/prisma-listing-group.repository';
import { PrismaListingFeedRepository } from '../repositories/prisma-listing-feed.repository';
import { PrismaListingRepository } from '../repositories/prisma-listing.repository';
import { PrismaListingRevisionRepository } from '../repositories/prisma-listing-revision.repository';
import { PrismaResourceRepository } from '../repositories/prisma-resource.repository';
import { PrismaPricingRuleRepository } from '../repositories/prisma-pricing-rule.repository';
import { PrismaOpenHoursReader } from '../repositories/prisma-open-hours.reader';
import { PrismaCancellationPolicyRepository } from '../repositories/prisma-cancellation-policy.repository';
import { CreateListingGroupUseCase } from '../../application/use-cases/create-listing-group.use-case';
import { ListListingGroupsUseCase } from '../../application/use-cases/list-listing-groups.use-case';
import { GetListingGroupUseCase } from '../../application/use-cases/get-listing-group.use-case';
import { UpdateListingGroupUseCase } from '../../application/use-cases/update-listing-group.use-case';
import { DeleteListingGroupUseCase } from '../../application/use-cases/delete-listing-group.use-case';
import { CreateResourceUseCase } from '../../application/use-cases/create-resource.use-case';
import { ListResourcesUseCase } from '../../application/use-cases/list-resources.use-case';
import { CreateListingUseCase } from '../../application/use-cases/create-listing.use-case';
import { ListListingsUseCase } from '../../application/use-cases/list-listings.use-case';
import { ListPartnerListingFeedUseCase } from '../../application/use-cases/list-partner-listing-feed.use-case';
import { ListListingsPageUseCase } from '../../application/use-cases/list-listings-page.use-case';
import { GetListingUseCase } from '../../application/use-cases/get-listing.use-case';
import { UpdateListingUseCase } from '../../application/use-cases/update-listing.use-case';
import { ApplyListingUpdateUseCase } from '../../application/use-cases/apply-listing-update.use-case';
import { ApplyListingGroupUpdateUseCase } from '../../application/use-cases/apply-listing-group-update.use-case';
import { SaveListingEditUseCase } from '../../application/use-cases/save-listing-edit.use-case';
import { SaveListingGroupEditUseCase } from '../../application/use-cases/save-listing-group-edit.use-case';
import { GetListingRevisionUseCase } from '../../application/use-cases/revisions/get-listing-revision.use-case';
import { GetListingGroupPendingChangesUseCase } from '../../application/use-cases/revisions/get-listing-group-pending-changes.use-case';
import { ListPendingRevisionsUseCase } from '../../application/use-cases/revisions/list-pending-revisions.use-case';
import { DiscardListingRevisionUseCase } from '../../application/use-cases/revisions/discard-listing-revision.use-case';
import { ApproveListingRevisionUseCase } from '../../application/use-cases/revisions/approve-listing-revision.use-case';
import { RejectListingRevisionUseCase } from '../../application/use-cases/revisions/reject-listing-revision.use-case';
import { DeleteListingUseCase } from '../../application/use-cases/delete-listing.use-case';
import { CreatePricingRuleUseCase } from '../../application/use-cases/create-pricing-rule.use-case';
import { ListPricingRulesUseCase } from '../../application/use-cases/list-pricing-rules.use-case';
import { DeletePricingRuleUseCase } from '../../application/use-cases/delete-pricing-rule.use-case';
import { GetPublicListingUseCase } from '../../application/use-cases/get-public-listing.use-case';
import { GetPublicQuoteUseCase } from '../../application/use-cases/get-public-quote.use-case';
import { ReviewListingUseCase } from '../../application/use-cases/moderation/review-listing.use-case';
import { ReviewListingGroupUseCase } from '../../application/use-cases/moderation/review-listing-group.use-case';
import { SubmitListingUseCase } from '../../application/use-cases/moderation/submit-listing.use-case';
import { PublishListingUseCase } from '../../application/use-cases/moderation/publish-listing.use-case';
import { HideListingUseCase } from '../../application/use-cases/moderation/hide-listing.use-case';
import { RepublishListingUseCase } from '../../application/use-cases/moderation/republish-listing.use-case';
import { SubmitListingGroupUseCase } from '../../application/use-cases/moderation/submit-listing-group.use-case';
import { PublishListingGroupUseCase } from '../../application/use-cases/moderation/publish-listing-group.use-case';
import { HideListingGroupUseCase } from '../../application/use-cases/moderation/hide-listing-group.use-case';
import { RepublishListingGroupUseCase } from '../../application/use-cases/moderation/republish-listing-group.use-case';
import { TenantListingGroupController } from './tenant-listing-group.controller';
import { TenantListingController } from './tenant-listing.controller';
import { TenantListingModerationController } from './tenant-listing-moderation.controller';
import { PartnerListingModerationController } from './partner-listing-moderation.controller';
import { PartnerListingRevisionController } from './partner-listing-revision.controller';
import { TenantListingRevisionController } from './tenant-listing-revision.controller';
import { TenantListingGroupModerationController } from './tenant-listing-group-moderation.controller';
import { PartnerListingGroupModerationController } from './partner-listing-group-moderation.controller';
import { TenantResourceController } from './tenant-resource.controller';
import { TenantPricingRuleController } from './tenant-pricing-rule.controller';
import { PartnerPricingRuleController } from './partner-pricing-rule.controller';
import { CreatePartnerPricingRuleUseCase } from '../../application/use-cases/create-partner-pricing-rule.use-case';
import { PreparePricingRuleWriteUseCase } from '../../application/use-cases/prepare-pricing-rule-write.use-case';
import { CreatePartnerPricingRuleRangeUseCase } from '../../application/use-cases/create-partner-pricing-rule-range.use-case';
import { DeletePartnerPricingRuleUseCase } from '../../application/use-cases/delete-partner-pricing-rule.use-case';
import { ListPartnerPricingRulesUseCase } from '../../application/use-cases/list-partner-pricing-rules.use-case';
import { PublicListingController } from './public-listing.controller';
import { PartnerListingGroupController } from './partner-listing-group.controller';
import { GetListingGroupDetailUseCase } from '../../application/use-cases/get-listing-group-detail.use-case';
import { GetPublicListingGroupUseCase } from '../../application/use-cases/get-public-listing-group.use-case';
import { ListCancellationPoliciesUseCase } from '../../application/use-cases/list-cancellation-policies.use-case';
import { ListTenantCancellationPoliciesUseCase } from '../../application/use-cases/list-tenant-cancellation-policies.use-case';
import { GetCancellationPolicyUseCase } from '../../application/use-cases/get-cancellation-policy.use-case';
import { CreateCancellationPolicyUseCase } from '../../application/use-cases/create-cancellation-policy.use-case';
import { UpdateCancellationPolicyUseCase } from '../../application/use-cases/update-cancellation-policy.use-case';
import { DeleteCancellationPolicyUseCase } from '../../application/use-cases/delete-cancellation-policy.use-case';
import { CreateTenantCancellationPolicyUseCase } from '../../application/use-cases/create-tenant-cancellation-policy.use-case';
import { UpdateTenantCancellationPolicyUseCase } from '../../application/use-cases/update-tenant-cancellation-policy.use-case';
import { DeleteTenantCancellationPolicyUseCase } from '../../application/use-cases/delete-tenant-cancellation-policy.use-case';
import { PartnerCancellationPolicyController } from './partner-cancellation-policy.controller';
import { GetListingDepositRequirementUseCase } from '../../application/use-cases/get-listing-deposit-requirement.use-case';
import { TenantCancellationPolicyController } from './tenant-cancellation-policy.controller';
import { ProjectReviewAggregatesUseCase } from '../../application/use-cases/project-review-aggregates.use-case';

@Module({
  imports: [
    PrismaModule,
    TenantContextModule,
    TenancyModule,
    CatalogModule,
    PartnerModule,
    AdministrativeDivisionModule,
    LegalModule,
  ],
  controllers: [
    TenantListingGroupController,
    TenantListingController,
    TenantListingModerationController,
    TenantListingRevisionController,
    PartnerListingModerationController,
    PartnerListingRevisionController,
    TenantListingGroupModerationController,
    PartnerListingGroupModerationController,
    PartnerListingGroupController,
    TenantResourceController,
    TenantPricingRuleController,
    PartnerPricingRuleController,
    PublicListingController,
    PartnerCancellationPolicyController,
    TenantCancellationPolicyController,
  ],
  providers: [
    { provide: LISTING_GROUP_REPOSITORY, useClass: PrismaListingGroupRepository },
    { provide: LISTING_FEED_REPOSITORY, useClass: PrismaListingFeedRepository },
    { provide: LISTING_REPOSITORY, useClass: PrismaListingRepository },
    { provide: LISTING_REVISION_REPOSITORY, useClass: PrismaListingRevisionRepository },
    { provide: RESOURCE_REPOSITORY, useClass: PrismaResourceRepository },
    { provide: PRICING_RULE_REPOSITORY, useClass: PrismaPricingRuleRepository },
    { provide: OPEN_HOURS_READER, useClass: PrismaOpenHoursReader },
    { provide: CANCELLATION_POLICY_REPOSITORY, useClass: PrismaCancellationPolicyRepository },
    { provide: COMMISSION_COVERAGE_READER, useClass: PrismaCommissionCoverageReader },
    { provide: REVIEW_AGGREGATE_PROJECTOR, useClass: PrismaReviewAggregateProjector },
    CreateListingGroupUseCase,
    ListListingGroupsUseCase,
    GetListingGroupUseCase,
    GetListingGroupDetailUseCase,
    UpdateListingGroupUseCase,
    DeleteListingGroupUseCase,
    CreateResourceUseCase,
    ListResourcesUseCase,
    CreateListingUseCase,
    AssertListingDepositCoverageUseCase,
    GetListingDepositRequirementUseCase,
    ListListingsUseCase,
    ListPartnerListingFeedUseCase,
    ListListingsPageUseCase,
    GetListingUseCase,
    UpdateListingUseCase,
    ApplyListingUpdateUseCase,
    ApplyListingGroupUpdateUseCase,
    SaveListingEditUseCase,
    SaveListingGroupEditUseCase,
    GetListingRevisionUseCase,
    GetListingGroupPendingChangesUseCase,
    ListPendingRevisionsUseCase,
    DiscardListingRevisionUseCase,
    ApproveListingRevisionUseCase,
    RejectListingRevisionUseCase,
    DeleteListingUseCase,
    CreatePricingRuleUseCase,
    ListPricingRulesUseCase,
    DeletePricingRuleUseCase,
    PreparePricingRuleWriteUseCase,
    CreatePartnerPricingRuleUseCase,
    CreatePartnerPricingRuleRangeUseCase,
    DeletePartnerPricingRuleUseCase,
    ListPartnerPricingRulesUseCase,
    GetPublicListingUseCase,
    GetPublicListingGroupUseCase,
    ListCancellationPoliciesUseCase,
    ListTenantCancellationPoliciesUseCase,
    GetCancellationPolicyUseCase,
    CreateCancellationPolicyUseCase,
    UpdateCancellationPolicyUseCase,
    DeleteCancellationPolicyUseCase,
    CreateTenantCancellationPolicyUseCase,
    UpdateTenantCancellationPolicyUseCase,
    DeleteTenantCancellationPolicyUseCase,
    GetPublicQuoteUseCase,
    ReviewListingUseCase,
    ReviewListingGroupUseCase,
    SubmitListingUseCase,
    PublishListingUseCase,
    HideListingUseCase,
    RepublishListingUseCase,
    SubmitListingGroupUseCase,
    PublishListingGroupUseCase,
    HideListingGroupUseCase,
    RepublishListingGroupUseCase,
    ProjectReviewAggregatesUseCase,
  ],
  // Exported for Task 1.6 (scheduling) + 1.7 (bookings): the listing/resource/pricing
  // repositories they read from. (Quote pricing is a plain function now —
  // `priceQuote` in application/pricing.ts — imported directly, not injected.)
  exports: [LISTING_REPOSITORY, RESOURCE_REPOSITORY, PRICING_RULE_REPOSITORY],
})
export class ListingModule implements OnModuleInit {
  private readonly logger = new Logger(ListingModule.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly projectReviewAggregates: ProjectReviewAggregatesUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register('review.created', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.projectReviewAggregates.execute(
        tenantId,
        (event.payload ?? {}) as { listingId?: string; groupId?: string | null },
      );
    });
  }

  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}
