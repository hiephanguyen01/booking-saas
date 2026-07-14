import {
  uuidSchema,
  type DomainResponse,
  type DomainVerificationResult,
  type Paginated,
  type PlanResponse,
  type SubscriptionResponse,
  type TenantResponse
} from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import {
  toDomainResponse,
  toPlanResponse,
  toSubscriptionResponse,
  toTenantResponse,
} from '../../application/tenancy.mapper';
import { AddDomainUseCase } from '../../application/use-cases/add-domain.use-case';
import { AssignSubscriptionUseCase } from '../../application/use-cases/assign-subscription.use-case';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { GetCurrentSubscriptionUseCase } from '../../application/use-cases/get-current-subscription.use-case';
import { GetTenantUseCase } from '../../application/use-cases/get-tenant.use-case';
import { ListDomainsUseCase } from '../../application/use-cases/list-domains.use-case';
import { ListTenantsUseCase } from '../../application/use-cases/list-tenants.use-case';
import { UpdateTenantUseCase } from '../../application/use-cases/update-tenant.use-case';
import { VerifyDomainUseCase } from '../../application/use-cases/verify-domain.use-case';
import {
  AddDomainDto,
  AssignSubscriptionDto,
  CreatedTenantDto,
  CreateTenantDto,
  CurrentSubscriptionDto,
  DomainResponseDto,
  DomainVerificationResultDto,
  PaginationQueryDto,
  SubscriptionResponseDto,
  TenantResponseDto,
  UpdateTenantDto,
} from './dto/tenancy.dto';

/** Platform-admin tenant management (§19 `/admin/tenants`). */
@ApiTags('admin: tenants')
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
  @ApiOperation({ summary: 'Create a tenant and its primary domain' })
  @ApiCreatedResponse({ type: CreatedTenantDto })
  async create(
    @Body() input: CreateTenantDto,
  ): Promise<TenantResponse & { primaryDomain: DomainResponse }> {
    const { tenant, primaryDomain } = await this.createTenant.execute(input);
    return { ...toTenantResponse(tenant), primaryDomain: toDomainResponse(primaryDomain) };
  }

  @RequirePermissions('platform.tenants.read')
  @Get()
  @ApiOperation({ summary: 'List tenants (paginated)' })
  @ApiPaginatedResponse(TenantResponseDto)
  async list(@Query() query: PaginationQueryDto): Promise<Paginated<TenantResponse>> {
    const { items, total } = await this.listTenants.execute(query);
    return {
      items: items.map(toTenantResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  @RequirePermissions('platform.tenants.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by id' })
  @UuidParam()
  @ApiOkResponse({ type: TenantResponseDto })
  async get(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<TenantResponse> {
    return toTenantResponse(await this.getTenant.execute(id));
  }

  @RequirePermissions('platform.tenants.write')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a tenant' })
  @UuidParam()
  @ApiOkResponse({ type: TenantResponseDto })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateTenantDto,
  ): Promise<TenantResponse> {
    return toTenantResponse(await this.updateTenant.execute(id, input));
  }

  @RequirePermissions('platform.subscriptions.manage')
  @Post(':id/subscription')
  @ApiOperation({ summary: 'Assign a subscription to a tenant' })
  @UuidParam()
  @ApiCreatedResponse({ type: SubscriptionResponseDto })
  async subscribe(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: AssignSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    return toSubscriptionResponse(await this.assignSubscription.execute(id, input));
  }

  @RequirePermissions('platform.tenants.read')
  @Get(':id/subscription')
  @ApiOperation({ summary: "Get a tenant's current subscription and plan" })
  @UuidParam()
  @ApiOkResponse({ type: CurrentSubscriptionDto })
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
  @ApiOperation({ summary: "List a tenant's custom domains" })
  @UuidParam()
  @ApiOkResponse({ type: [DomainResponseDto] })
  async domains(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<DomainResponse[]> {
    return (await this.listDomains.execute(id)).map(toDomainResponse);
  }

  @RequirePermissions('platform.tenants.write')
  @Post(':id/domains')
  @ApiOperation({ summary: 'Add a custom domain to a tenant' })
  @UuidParam()
  @ApiCreatedResponse({ type: DomainResponseDto })
  async createDomain(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: AddDomainDto,
  ): Promise<DomainResponse> {
    return toDomainResponse(await this.addDomain.execute(id, input));
  }

  @RequirePermissions('platform.tenants.write')
  @Post(':id/domains/:domainId/verify')
  @HttpCode(202)
  @ApiOperation({ summary: 'Trigger custom-domain verification' })
  @UuidParam()
  @UuidParam('domainId')
  @ApiAcceptedResponse({ type: DomainVerificationResultDto })
  async verify(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Param('domainId', new ZodValidationPipe(uuidSchema)) domainId: string,
  ): Promise<DomainVerificationResult> {
    const { status, domain } = await this.verifyDomain.execute(id, domainId);
    return { status, domain: toDomainResponse(domain) };
  }
}
