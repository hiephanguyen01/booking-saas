import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { IdentityAccessModule } from '../../../identity-access/infrastructure/http/identity-access.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { AdministrativeDivisionModule } from '../../../administrative-division/infrastructure/http/administrative-division.module';
import { PARTNER_REPOSITORY } from '../../domain/ports/partner-repository.port';
import { AGREEMENT_REPOSITORY } from '../../domain/ports/agreement-repository.port';
import { PARTNER_ROLES } from '../../domain/ports/partner-roles.port';
import { PrismaPartnerRepository } from '../repositories/prisma-partner.repository';
import { PrismaAgreementRepository } from '../repositories/prisma-agreement.repository';
import { PrismaPartnerRoles } from '../services/prisma-partner-roles';
import { ApplyAsPartnerUseCase } from '../../application/use-cases/apply-as-partner.use-case';
import { CreateHousePartnerUseCase } from '../../application/use-cases/create-house-partner.use-case';
import { ApprovePartnerUseCase } from '../../application/use-cases/approve-partner.use-case';
import { SubmitIdentityUseCase } from '../../application/use-cases/submit-identity.use-case';
import { VerifyIdentityUseCase } from '../../application/use-cases/verify-identity.use-case';
import { UpdatePayoutInfoUseCase } from '../../application/use-cases/update-payout-info.use-case';
import { UpdatePartnerDocumentsUseCase } from '../../application/use-cases/update-partner-documents.use-case';
import { SuspendPartnerUseCase } from '../../application/use-cases/suspend-partner.use-case';
import { ListPartnersUseCase } from '../../application/use-cases/list-partners.use-case';
import { GetPartnerUseCase } from '../../application/use-cases/get-partner.use-case';
import { GetPartnerProfileUseCase } from '../../application/use-cases/get-partner-profile.use-case';
import { PartnerApplicationController } from './partner-application.controller';
import { TenantPartnerController } from './tenant-partner.controller';
import { PartnerProfileController } from './partner-profile.controller';

@Module({
  imports: [
    PrismaModule,
    TenantContextModule,
    IdentityAccessModule,
    TenancyModule,
    AdministrativeDivisionModule,
  ],
  controllers: [PartnerApplicationController, TenantPartnerController, PartnerProfileController],
  providers: [
    { provide: PARTNER_REPOSITORY, useClass: PrismaPartnerRepository },
    { provide: AGREEMENT_REPOSITORY, useClass: PrismaAgreementRepository },
    { provide: PARTNER_ROLES, useClass: PrismaPartnerRoles },
    ApplyAsPartnerUseCase,
    CreateHousePartnerUseCase,
    ApprovePartnerUseCase,
    SubmitIdentityUseCase,
    VerifyIdentityUseCase,
    UpdatePayoutInfoUseCase,
    UpdatePartnerDocumentsUseCase,
    SuspendPartnerUseCase,
    ListPartnersUseCase,
    GetPartnerUseCase,
    GetPartnerProfileUseCase,
  ],
  // Exported so Task 1.4 (listing creation) reads the partner's verification status.
  // The identity-verification gate itself is a plain function
  // (application/assert-can-serve-listing-type.ts), imported directly.
  exports: [PARTNER_REPOSITORY],
})
export class PartnerModule {}
