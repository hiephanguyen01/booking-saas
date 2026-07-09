import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { CatalogModule } from '../../../catalog/infrastructure/http/catalog.module';
import { PartnerModule } from '../../../partner/infrastructure/http/partner.module';
import { LISTING_GROUP_REPOSITORY } from '../../domain/ports/listing-group-repository.port';
import { LISTING_REPOSITORY } from '../../domain/ports/listing-repository.port';
import { RESOURCE_REPOSITORY } from '../../domain/ports/resource-repository.port';
import { PRICING_RULE_REPOSITORY } from '../../domain/ports/pricing-rule-repository.port';
import { PrismaListingGroupRepository } from '../repositories/prisma-listing-group.repository';
import { PrismaListingRepository } from '../repositories/prisma-listing.repository';
import { PrismaResourceRepository } from '../repositories/prisma-resource.repository';
import { PrismaPricingRuleRepository } from '../repositories/prisma-pricing-rule.repository';
import { PricingService } from '../../application/services/pricing.service';
import { CreateListingGroupUseCase } from '../../application/use-cases/create-listing-group.use-case';
import { ListListingGroupsUseCase } from '../../application/use-cases/list-listing-groups.use-case';
import { GetListingGroupUseCase } from '../../application/use-cases/get-listing-group.use-case';
import { UpdateListingGroupUseCase } from '../../application/use-cases/update-listing-group.use-case';
import { DeleteListingGroupUseCase } from '../../application/use-cases/delete-listing-group.use-case';
import { CreateResourceUseCase } from '../../application/use-cases/create-resource.use-case';
import { ListResourcesUseCase } from '../../application/use-cases/list-resources.use-case';
import { CreateListingUseCase } from '../../application/use-cases/create-listing.use-case';
import { ListListingsUseCase } from '../../application/use-cases/list-listings.use-case';
import { GetListingUseCase } from '../../application/use-cases/get-listing.use-case';
import { UpdateListingUseCase } from '../../application/use-cases/update-listing.use-case';
import { DeleteListingUseCase } from '../../application/use-cases/delete-listing.use-case';
import { CreatePricingRuleUseCase } from '../../application/use-cases/create-pricing-rule.use-case';
import { ListPricingRulesUseCase } from '../../application/use-cases/list-pricing-rules.use-case';
import { DeletePricingRuleUseCase } from '../../application/use-cases/delete-pricing-rule.use-case';
import { GetPublicListingUseCase } from '../../application/use-cases/get-public-listing.use-case';
import { GetPublicQuoteUseCase } from '../../application/use-cases/get-public-quote.use-case';
import { ReviewListingUseCase } from '../../application/use-cases/moderation/review-listing.use-case';
import { SubmitListingUseCase } from '../../application/use-cases/moderation/submit-listing.use-case';
import { PublishListingUseCase } from '../../application/use-cases/moderation/publish-listing.use-case';
import { HideListingUseCase } from '../../application/use-cases/moderation/hide-listing.use-case';
import { RepublishListingUseCase } from '../../application/use-cases/moderation/republish-listing.use-case';
import { GroupModerationUseCase } from '../../application/use-cases/moderation/group-moderation.use-case';
import { TenantListingGroupController } from './tenant-listing-group.controller';
import { TenantListingController } from './tenant-listing.controller';
import { TenantListingModerationController } from './tenant-listing-moderation.controller';
import { PartnerListingModerationController } from './partner-listing-moderation.controller';
import {
  TenantListingGroupModerationController,
  PartnerListingGroupModerationController,
} from './listing-group-moderation.controller';
import { TenantResourceController } from './tenant-resource.controller';
import { TenantPricingRuleController } from './tenant-pricing-rule.controller';
import { PublicListingController } from './public-listing.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule, CatalogModule, PartnerModule],
  controllers: [
    TenantListingGroupController,
    TenantListingController,
    TenantListingModerationController,
    PartnerListingModerationController,
    TenantListingGroupModerationController,
    PartnerListingGroupModerationController,
    TenantResourceController,
    TenantPricingRuleController,
    PublicListingController,
  ],
  providers: [
    { provide: LISTING_GROUP_REPOSITORY, useClass: PrismaListingGroupRepository },
    { provide: LISTING_REPOSITORY, useClass: PrismaListingRepository },
    { provide: RESOURCE_REPOSITORY, useClass: PrismaResourceRepository },
    { provide: PRICING_RULE_REPOSITORY, useClass: PrismaPricingRuleRepository },
    PricingService,
    CreateListingGroupUseCase,
    ListListingGroupsUseCase,
    GetListingGroupUseCase,
    UpdateListingGroupUseCase,
    DeleteListingGroupUseCase,
    CreateResourceUseCase,
    ListResourcesUseCase,
    CreateListingUseCase,
    ListListingsUseCase,
    GetListingUseCase,
    UpdateListingUseCase,
    DeleteListingUseCase,
    CreatePricingRuleUseCase,
    ListPricingRulesUseCase,
    DeletePricingRuleUseCase,
    GetPublicListingUseCase,
    GetPublicQuoteUseCase,
    ReviewListingUseCase,
    SubmitListingUseCase,
    PublishListingUseCase,
    HideListingUseCase,
    RepublishListingUseCase,
    GroupModerationUseCase,
  ],
  // Exported so Task 1.7 (bookings) can price a quote before checkout.
  exports: [PricingService],
})
export class ListingModule {}
