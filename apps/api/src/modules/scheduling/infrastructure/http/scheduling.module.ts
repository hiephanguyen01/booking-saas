import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { ListingModule } from '../../../listing/infrastructure/http/listing.module';
import { AVAILABILITY_RULE_REPOSITORY } from '../../domain/ports/availability-rule-repository.port';
import { AVAILABILITY_EXCEPTION_REPOSITORY } from '../../domain/ports/availability-exception-repository.port';
import { BUSY_READER } from '../../domain/ports/busy-reader.port';
import { PrismaAvailabilityRuleRepository } from '../repositories/prisma-availability-rule.repository';
import { PrismaAvailabilityExceptionRepository } from '../repositories/prisma-availability-exception.repository';
import { PrismaBusyReader } from '../repositories/prisma-busy-reader';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { ManageAvailabilityUseCase } from '../../application/use-cases/manage-availability.use-case';
import { PublicAvailabilityController } from './public-availability.controller';
import { TenantAvailabilityController } from './tenant-availability.controller';
import { PartnerAvailabilityController } from './partner-availability.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule, ListingModule],
  controllers: [
    PublicAvailabilityController,
    TenantAvailabilityController,
    PartnerAvailabilityController,
  ],
  providers: [
    { provide: AVAILABILITY_RULE_REPOSITORY, useClass: PrismaAvailabilityRuleRepository },
    { provide: AVAILABILITY_EXCEPTION_REPOSITORY, useClass: PrismaAvailabilityExceptionRepository },
    { provide: BUSY_READER, useClass: PrismaBusyReader },
    GetAvailabilityUseCase,
    ManageAvailabilityUseCase,
  ],
})
export class SchedulingModule {}
