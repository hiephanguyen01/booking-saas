import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  createTenantInputSchema,
  paginationQuerySchema,
  updateTenantInputSchema,
  uuidSchema,
  type AddDomainInput,
  type AssignSubscriptionInput,
  type CreateTenantInput,
  type DomainResponse,
  type Paginated,
  type PaginationQuery,
  type PlanResponse,
  type SubscriptionResponse,
  type TenantResponse,
  type UpdateTenantInput,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { ListTenantsUseCase } from '../../application/use-cases/list-tenants.use-case';
import { GetTenantUseCase } from '../../application/use-cases/get-tenant.use-case';
import { UpdateTenantUseCase } from '../../application/use-cases/update-tenant.use-case';
import { AssignSubscriptionUseCase } from '../../application/use-cases/assign-subscription.use-case';
import { GetCurrentSubscriptionUseCase } from '../../application/use-cases/get-current-subscription.use-case';
import { AddDomainUseCase } from '../../application/use-cases/add-domain.use-case';
import { VerifyDomainUseCase } from '../../application/use-cases/verify-domain.use-case';
import { ListDomainsUseCase } from '../../application/use-cases/list-domains.use-case';
import {
  toDomainResponse,
  toPlanResponse,
  toSubscriptionResponse,
  toTenantResponse,
} from '../../application/tenancy.mapper';

/** Platform-admin tenant management (§19 `/admin/tenants`). */
@Controller('admin/tenants')
export class AdminTenantController {
  constructor(
    private readonly createTenant: CreateTenantUseCase,
    private readonly listTenants: ListTenantsUseCase,
    private readonly getTenant: GetTenantUseCase,
    private readonly updateTenant: UpdateTenantUseCase,
    private readonly assignSubscription: AssignSubscriptionUseCase,
    private readonly getCurrentSubscription: GetCurrentSubscriptionUseCase,
    private readonly addDomain: AddDomainUseCase,
    private readonly verifyDomain: VerifyDomainUseCase,
    private readonly listDomains: ListDomainsUseCase,
  ) {}

  @RequirePermissions('platform.tenants.write')
  @Post()
  async create(
    @Body(new ZodValidationPipe(createTenantInputSchema)) input: CreateTenantInput,
  ): Promise<TenantResponse & { primaryDomain: DomainResponse }> {
    const { tenant, primaryDomain } = await this.createTenant.execute(input);
    return { ...toTenantResponse(tenant), primaryDomain: toDomainResponse(primaryDomain) };
  }

  @RequirePermissions('platform.tenants.read')
  @Get()
  async list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<TenantResponse>> {
    const { items, total } = await this.listTenants.execute(query);
    return { items: items.map(toTenantResponse), page: query.page, pageSize: query.pageSize, total };
  }

  @RequirePermissions('platform.tenants.read')
  @Get(':id')
  async get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<TenantResponse> {
    return toTenantResponse(await this.getTenant.execute(id));
  }

  @RequirePermissions('platform.tenants.write')
  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateTenantInputSchema)) input: UpdateTenantInput,
  ): Promise<TenantResponse> {
    return toTenantResponse(await this.updateTenant.execute(id, input));
  }

  @RequirePermissions('platform.subscriptions.manage')
  @Post(':id/subscription')
  async subscribe(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(assignSubscriptionInputSchema)) input: AssignSubscriptionInput,
  ): Promise<SubscriptionResponse> {
    return toSubscriptionResponse(await this.assignSubscription.execute(id, input));
  }

  @RequirePermissions('platform.tenants.read')
  @Get(':id/subscription')
  async subscription(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<{ subscription: SubscriptionResponse; plan: PlanResponse | null } | null> {
    const current = await this.getCurrentSubscription.execute(id);
    if (!current) return null;
    return {
      subscription: toSubscriptionResponse(current.subscription),
      plan: current.plan ? toPlanResponse(current.plan) : null,
    };
  }

  @RequirePermissions('platform.tenants.read')
  @Get(':id/domains')
  async domains(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<DomainResponse[]> {
    return (await this.listDomains.execute(id)).map(toDomainResponse);
  }

  @RequirePermissions('platform.tenants.write')
  @Post(':id/domains')
  async createDomain(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(addDomainInputSchema)) input: AddDomainInput,
  ): Promise<DomainResponse> {
    return toDomainResponse(await this.addDomain.execute(id, input));
  }

  @RequirePermissions('platform.tenants.write')
  @Post(':id/domains/:domainId/verify')
  @HttpCode(200)
  async verify(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Param('domainId', new ZodValidationPipe(uuidSchema)) domainId: string,
  ): Promise<DomainResponse> {
    return toDomainResponse(await this.verifyDomain.execute(id, domainId));
  }
}
