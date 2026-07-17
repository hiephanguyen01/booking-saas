import {
  uuidSchema,
  type DomainResponse,
  type DomainVerificationResult,
  type Paginated,
  type PlanResponse,
  type SlugAvailabilityResponse,
  type SubscriptionHistoryItem,
  type SubscriptionResponse,
  type TenancyConfigResponse,
  type TenantDetailResponse,
  type TenantResponse,
} from '@booking/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { PaginationQueryDto } from '../../../../shared/pagination/pagination.dto';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import {
  toDomainResponse,
  toPlanResponse,
  toSubscriptionHistoryItem,
  toSubscriptionResponse,
  toTenantDetailResponse,
  toTenantResponse,
} from '../../application/tenancy.mapper';
import { AddDomainUseCase } from '../../application/use-cases/add-domain.use-case';
import { AssignSubscriptionUseCase } from '../../application/use-cases/assign-subscription.use-case';
import { CheckSlugAvailabilityUseCase } from '../../application/use-cases/check-slug-availability.use-case';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { DeleteDomainUseCase } from '../../application/use-cases/delete-domain.use-case';
import { GetCurrentSubscriptionUseCase } from '../../application/use-cases/get-current-subscription.use-case';
import { GetTenancyConfigUseCase } from '../../application/use-cases/get-tenancy-config.use-case';
import { GetTenantDetailUseCase } from '../../application/use-cases/get-tenant-detail.use-case';
import { ListDomainsUseCase } from '../../application/use-cases/list-domains.use-case';
import { ListSubscriptionsUseCase } from '../../application/use-cases/list-subscriptions.use-case';
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
  ListTenantsQueryDto,
  SlugAvailabilityResponseDto,
  SlugCheckQueryDto,
  SubscriptionHistoryItemDto,
  SubscriptionResponseDto,
  TenancyConfigResponseDto,
  TenantDetailResponseDto,
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
    private readonly getTenantDetail: GetTenantDetailUseCase,
    private readonly checkSlug: CheckSlugAvailabilityUseCase,
    private readonly updateTenant: UpdateTenantUseCase,
    private readonly assignSubscription: AssignSubscriptionUseCase,
    private readonly getCurrentSubscription: GetCurrentSubscriptionUseCase,
    private readonly listSubscriptions: ListSubscriptionsUseCase,
    private readonly addDomain: AddDomainUseCase,
    private readonly verifyDomain: VerifyDomainUseCase,
    private readonly listDomains: ListDomainsUseCase,
    private readonly deleteDomain: DeleteDomainUseCase,
    private readonly getTenancyConfig: GetTenancyConfigUseCase,
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
  @ApiOperation({ summary: 'List tenants (paginated; filter by search, status, vertical)' })
  @ApiPaginatedResponse(TenantResponseDto)
  async list(@Query() query: ListTenantsQueryDto): Promise<Paginated<TenantResponse>> {
    const { items, total } = await this.listTenants.execute(query);
    return {
      items: items.map(toTenantResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  // NOTE: `config` and `slug-check` are declared BEFORE `:id` on purpose — Nest
  // matches in declaration order, and `:id` would otherwise swallow both and
  // reject them as malformed uuids.

  @RequirePermissions('platform.tenants.read')
  @Get('config')
  @ApiOperation({ summary: 'Platform tenancy config (base domain for tenant subdomains)' })
  @ApiOkResponse({ type: TenancyConfigResponseDto })
  tenancyConfig(): TenancyConfigResponse {
    return this.getTenancyConfig.execute();
  }

  @RequirePermissions('platform.tenants.read')
  @Get('slug-check')
  @ApiOperation({ summary: 'Check whether a tenant slug (and its subdomain) is free' })
  @ApiOkResponse({ type: SlugAvailabilityResponseDto })
  async slugCheck(@Query() query: SlugCheckQueryDto): Promise<SlugAvailabilityResponse> {
    return this.checkSlug.execute(query.slug);
  }

  @RequirePermissions('platform.tenants.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant with its subscription, primary domain and counts' })
  @UuidParam()
  @ApiOkResponse({ type: TenantDetailResponseDto })
  async get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<TenantDetailResponse> {
    return toTenantDetailResponse(await this.getTenantDetail.execute(id));
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
  @Get(':id/subscriptions')
  @ApiOperation({ summary: "A tenant's subscription history, newest first (paginated)" })
  @UuidParam()
  @ApiPaginatedResponse(SubscriptionHistoryItemDto)
  async subscriptionHistory(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<SubscriptionHistoryItem>> {
    const result = await this.listSubscriptions.execute(id, query);
    return toPaginated(query, result, toSubscriptionHistoryItem);
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

  /**
   * Removes a domain mapping. The tenant-facing controller has always had this;
   * without it a platform admin who mistyped a hostname could add one but never
   * take it back. Same use case, so the ownership check and the
   * DOMAIN_PRIMARY_REQUIRED guard (never orphan the live storefront) apply here too.
   */
  @RequirePermissions('platform.tenants.write')
  @Delete(':id/domains/:domainId')
  @HttpCode(204)
  @ApiOperation({ summary: "Remove one of a tenant's custom domains" })
  @UuidParam()
  @UuidParam('domainId')
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'DOMAIN_PRIMARY_REQUIRED' })
  async removeDomain(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Param('domainId', new ZodValidationPipe(uuidSchema)) domainId: string,
  ): Promise<void> {
    await this.deleteDomain.execute(id, domainId);
  }
}
