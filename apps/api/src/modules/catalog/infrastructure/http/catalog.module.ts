import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { LISTING_TYPE_REPOSITORY } from '../../domain/ports/listing-type-repository.port';
import { LISTING_READ_REPOSITORY } from '../../domain/ports/listing-read-repository.port';
import { PrismaListingTypeRepository } from '../repositories/prisma-listing-type.repository';
import { PrismaListingReadRepository } from '../repositories/prisma-listing-read.repository';
import { CreateListingTypeUseCase } from '../../application/use-cases/create-listing-type.use-case';
import { ListListingTypesUseCase } from '../../application/use-cases/list-listing-types.use-case';
import { GetListingTypeUseCase } from '../../application/use-cases/get-listing-type.use-case';
import { UpdateListingTypeUseCase } from '../../application/use-cases/update-listing-type.use-case';
import { DeleteListingTypeUseCase } from '../../application/use-cases/delete-listing-type.use-case';
import { ListPublicListingTypesUseCase } from '../../application/use-cases/list-public-listing-types.use-case';
import { ListPublicListingsUseCase } from '../../application/use-cases/list-public-listings.use-case';
import { SearchPublicCatalogUseCase } from '../../application/use-cases/search-public-catalog.use-case';
import { AttributeValidatorService } from '../../application/services/attribute-validator.service';
import { TenantListingTypeController } from './tenant-listing-type.controller';
import { PartnerListingTypeController } from './partner-listing-type.controller';
import { PublicCatalogController } from './public-catalog.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [TenantListingTypeController, PartnerListingTypeController, PublicCatalogController],
  providers: [
    { provide: LISTING_TYPE_REPOSITORY, useClass: PrismaListingTypeRepository },
    { provide: LISTING_READ_REPOSITORY, useClass: PrismaListingReadRepository },
    CreateListingTypeUseCase,
    ListListingTypesUseCase,
    GetListingTypeUseCase,
    UpdateListingTypeUseCase,
    DeleteListingTypeUseCase,
    ListPublicListingTypesUseCase,
    ListPublicListingsUseCase,
    SearchPublicCatalogUseCase,
    AttributeValidatorService,
  ],
  // Exported so Task 1.4 (listing creation) validates attributes against the type
  // schema and reads the type (allowedModes / requiresIdentityVerification).
  exports: [AttributeValidatorService, LISTING_TYPE_REPOSITORY],
})
export class CatalogModule {}
