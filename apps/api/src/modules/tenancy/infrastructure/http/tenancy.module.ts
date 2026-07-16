import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { TENANT_REPOSITORY } from '../../domain/ports/tenant-repository.port';
import { PLAN_REPOSITORY } from '../../domain/ports/plan-repository.port';
import { SUBSCRIPTION_REPOSITORY } from '../../domain/ports/subscription-repository.port';
import { TENANT_DOMAIN_REPOSITORY } from '../../domain/ports/tenant-domain-repository.port';
import { TENANT_CACHE } from '../../domain/ports/tenant-cache.port';
import { DNS_VERIFIER } from '../../domain/ports/dns-verifier.port';
import { DOMAIN_VERIFICATION_QUEUE } from '../../domain/ports/domain-verification-queue.port';
import { TENANCY_CONFIG } from '../../domain/ports/tenancy-config';
import { PrismaTenantRepository } from '../repositories/prisma-tenant.repository';
import { PrismaPlanRepository } from '../repositories/prisma-plan.repository';
import { PrismaSubscriptionRepository } from '../repositories/prisma-subscription.repository';
import { PrismaTenantDomainRepository } from '../repositories/prisma-tenant-domain.repository';
import { RedisTenantCache } from '../services/redis-tenant-cache';
import { NodeDnsVerifier } from '../services/node-dns-verifier';
import { DomainVerificationWorker } from '../domain-verification.worker';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { ListTenantsUseCase } from '../../application/use-cases/list-tenants.use-case';
import { GetTenantUseCase } from '../../application/use-cases/get-tenant.use-case';
import { GetTenantDetailUseCase } from '../../application/use-cases/get-tenant-detail.use-case';
import { CheckSlugAvailabilityUseCase } from '../../application/use-cases/check-slug-availability.use-case';
import { UpdateTenantUseCase } from '../../application/use-cases/update-tenant.use-case';
import { CreatePlanUseCase } from '../../application/use-cases/create-plan.use-case';
import { ListPlansUseCase } from '../../application/use-cases/list-plans.use-case';
import { UpdatePlanUseCase } from '../../application/use-cases/update-plan.use-case';
import { DeletePlanUseCase } from '../../application/use-cases/delete-plan.use-case';
import { AssignSubscriptionUseCase } from '../../application/use-cases/assign-subscription.use-case';
import { GetCurrentSubscriptionUseCase } from '../../application/use-cases/get-current-subscription.use-case';
import { ListSubscriptionsUseCase } from '../../application/use-cases/list-subscriptions.use-case';
import { GetSubscriptionStatusUseCase } from '../../application/use-cases/get-subscription-status.use-case';
import { SetPartnerPromotionsUseCase } from '../../application/use-cases/set-partner-promotions.use-case';
import { AddDomainUseCase } from '../../application/use-cases/add-domain.use-case';
import { VerifyDomainUseCase } from '../../application/use-cases/verify-domain.use-case';
import { ListDomainsUseCase } from '../../application/use-cases/list-domains.use-case';
import { DeleteDomainUseCase } from '../../application/use-cases/delete-domain.use-case';
import { ResolveTenantByHostUseCase } from '../../application/use-cases/resolve-tenant-by-host.use-case';
import { GetPlatformHealthUseCase } from '../../application/use-cases/get-platform-health.use-case';
import { PlanLimitService } from '../../application/services/plan-limit.service';
import { PlanLimitGuard } from './guards/plan-limit.guard';
import { RequireActiveSubscriptionGuard } from './guards/require-active-subscription.guard';
import { AdminTenantController } from './admin-tenant.controller';
import { AdminPlanController } from './admin-plan.controller';
import { PlatformHealthController } from './platform-health.controller';
import { PublicTenantController } from './public-tenant.controller';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [
    AdminTenantController,
    AdminPlanController,
    PlatformHealthController,
    PublicTenantController,
    TenantSettingsController,
  ],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: PrismaTenantRepository },
    { provide: PLAN_REPOSITORY, useClass: PrismaPlanRepository },
    { provide: SUBSCRIPTION_REPOSITORY, useClass: PrismaSubscriptionRepository },
    { provide: TENANT_DOMAIN_REPOSITORY, useClass: PrismaTenantDomainRepository },
    { provide: TENANT_CACHE, useClass: RedisTenantCache },
    { provide: DNS_VERIFIER, useClass: NodeDnsVerifier },
    DomainVerificationWorker,
    { provide: DOMAIN_VERIFICATION_QUEUE, useExisting: DomainVerificationWorker },
    {
      provide: TENANCY_CONFIG,
      useValue: { baseDomain: process.env.PLATFORM_BASE_DOMAIN ?? 'bookify.vn' },
    },
    CreateTenantUseCase,
    ListTenantsUseCase,
    GetTenantUseCase,
    GetTenantDetailUseCase,
    CheckSlugAvailabilityUseCase,
    UpdateTenantUseCase,
    CreatePlanUseCase,
    ListPlansUseCase,
    UpdatePlanUseCase,
    DeletePlanUseCase,
    AssignSubscriptionUseCase,
    GetCurrentSubscriptionUseCase,
    ListSubscriptionsUseCase,
    GetSubscriptionStatusUseCase,
    SetPartnerPromotionsUseCase,
    AddDomainUseCase,
    VerifyDomainUseCase,
    ListDomainsUseCase,
    DeleteDomainUseCase,
    ResolveTenantByHostUseCase,
    GetPlatformHealthUseCase,
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
    // The catalog's public endpoints resolve the tenant from the Host with this.
    ResolveTenantByHostUseCase,
  ],
})
export class TenancyModule {}
