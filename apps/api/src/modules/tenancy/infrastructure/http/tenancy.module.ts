import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { TENANT_REPOSITORY } from '../../domain/ports/tenant-repository.port';
import { PLAN_REPOSITORY } from '../../domain/ports/plan-repository.port';
import { SUBSCRIPTION_REPOSITORY } from '../../domain/ports/subscription-repository.port';
import { TENANT_DOMAIN_REPOSITORY } from '../../domain/ports/tenant-domain-repository.port';
import { TENANT_CACHE } from '../../domain/ports/tenant-cache.port';
import { DNS_VERIFIER } from '../../domain/ports/dns-verifier.port';
import { TENANCY_CONFIG } from '../../domain/ports/tenancy-config';
import { PrismaTenantRepository } from '../repositories/prisma-tenant.repository';
import { PrismaPlanRepository } from '../repositories/prisma-plan.repository';
import { PrismaSubscriptionRepository } from '../repositories/prisma-subscription.repository';
import { PrismaTenantDomainRepository } from '../repositories/prisma-tenant-domain.repository';
import { RedisTenantCache } from '../services/redis-tenant-cache';
import { NodeDnsVerifier } from '../services/node-dns-verifier';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { ListTenantsUseCase } from '../../application/use-cases/list-tenants.use-case';
import { GetTenantUseCase } from '../../application/use-cases/get-tenant.use-case';
import { UpdateTenantUseCase } from '../../application/use-cases/update-tenant.use-case';
import { CreatePlanUseCase } from '../../application/use-cases/create-plan.use-case';
import { ListPlansUseCase } from '../../application/use-cases/list-plans.use-case';
import { AssignSubscriptionUseCase } from '../../application/use-cases/assign-subscription.use-case';
import { AddDomainUseCase } from '../../application/use-cases/add-domain.use-case';
import { VerifyDomainUseCase } from '../../application/use-cases/verify-domain.use-case';
import { ListDomainsUseCase } from '../../application/use-cases/list-domains.use-case';
import { ResolveTenantByHostUseCase } from '../../application/use-cases/resolve-tenant-by-host.use-case';
import { PlanLimitService } from '../../application/services/plan-limit.service';
import { PlanLimitGuard } from './guards/plan-limit.guard';
import { RequireActiveSubscriptionGuard } from './guards/require-active-subscription.guard';
import { AdminTenantController } from './admin-tenant.controller';
import { AdminPlanController } from './admin-plan.controller';
import { PublicTenantController } from './public-tenant.controller';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [AdminTenantController, AdminPlanController, PublicTenantController],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: PrismaTenantRepository },
    { provide: PLAN_REPOSITORY, useClass: PrismaPlanRepository },
    { provide: SUBSCRIPTION_REPOSITORY, useClass: PrismaSubscriptionRepository },
    { provide: TENANT_DOMAIN_REPOSITORY, useClass: PrismaTenantDomainRepository },
    { provide: TENANT_CACHE, useClass: RedisTenantCache },
    { provide: DNS_VERIFIER, useClass: NodeDnsVerifier },
    {
      provide: TENANCY_CONFIG,
      useValue: { baseDomain: process.env.PLATFORM_BASE_DOMAIN ?? 'bookify.vn' },
    },
    CreateTenantUseCase,
    ListTenantsUseCase,
    GetTenantUseCase,
    UpdateTenantUseCase,
    CreatePlanUseCase,
    ListPlansUseCase,
    AssignSubscriptionUseCase,
    AddDomainUseCase,
    VerifyDomainUseCase,
    ListDomainsUseCase,
    ResolveTenantByHostUseCase,
    PlanLimitService,
    PlanLimitGuard,
    RequireActiveSubscriptionGuard,
  ],
  // Exported so downstream feature modules can enforce limits / active plans and
  // look up tenants (e.g. partner onboarding validates the target tenant).
  // SUBSCRIPTION_REPOSITORY is exported too so RequireActiveSubscriptionGuard can
  // be re-instantiated in a consuming module's injector via @UseGuards.
  exports: [
    PlanLimitService,
    PlanLimitGuard,
    RequireActiveSubscriptionGuard,
    TENANT_REPOSITORY,
    SUBSCRIPTION_REPOSITORY,
  ],
})
export class TenancyModule {}
