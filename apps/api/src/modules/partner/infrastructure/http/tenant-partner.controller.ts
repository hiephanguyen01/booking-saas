import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  uuidSchema,
  type Paginated,
  type PartnerResponse,
  type VerifyIdentityInput,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import {
  ApiPaginatedResponse,
  UuidParam,
} from '../../../../shared/openapi/decorators';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { PlanLimitGuard } from '../../../tenancy/infrastructure/http/guards/plan-limit.guard';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { EnforcePlanLimit } from '../../../tenancy/infrastructure/http/decorators/enforce-plan-limit.decorator';
import { ListPartnersUseCase } from '../../application/use-cases/list-partners.use-case';
import { GetPartnerUseCase } from '../../application/use-cases/get-partner.use-case';
import { CreateHousePartnerUseCase } from '../../application/use-cases/create-house-partner.use-case';
import { ApprovePartnerUseCase } from '../../application/use-cases/approve-partner.use-case';
import { VerifyIdentityUseCase } from '../../application/use-cases/verify-identity.use-case';
import { SuspendPartnerUseCase } from '../../application/use-cases/suspend-partner.use-case';
import { toPartnerResponse } from '../../application/partner.mapper';
import {
  ApprovePartnerDto,
  CreateHousePartnerDto,
  ListPartnersQueryDto,
  PartnerResponseDto,
  VerifyIdentityDto,
} from './dto/partner.dto';

/** Tenant-side partner management + approval queue (§7.3), scope via x-tenant-id. */
@ApiTags('tenant-partners')
@Controller('tenant/partners')
export class TenantPartnerController {
  constructor(
    private readonly listPartners: ListPartnersUseCase,
    private readonly getPartner: GetPartnerUseCase,
    private readonly createHousePartner: CreateHousePartnerUseCase,
    private readonly approvePartner: ApprovePartnerUseCase,
    private readonly verifyIdentity: VerifyIdentityUseCase,
    private readonly suspendPartner: SuspendPartnerUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.partners.read')
  @Get()
  @ApiOperation({ summary: 'List partners under the tenant' })
  @ApiPaginatedResponse(PartnerResponseDto)
  async list(
    @Query() query: ListPartnersQueryDto,
  ): Promise<Paginated<PartnerResponse>> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const { items, total } = await this.listPartners.execute(tenantId, query);
    return {
      items: items.map(toPartnerResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  @RequirePermissions('tenant.partners.manage')
  @UseGuards(RequireActiveSubscriptionGuard, PlanLimitGuard)
  @EnforcePlanLimit('partner')
  @Post('house')
  @ApiOperation({ summary: 'Create a house partner for the tenant' })
  @ApiCreatedResponse({ type: PartnerResponseDto })
  async createHouse(
    @Body() input: CreateHousePartnerDto,
  ): Promise<PartnerResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toPartnerResponse(await this.createHousePartner.execute(tenantId, input));
  }

  @RequirePermissions('tenant.partners.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a partner by id' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerResponseDto })
  async get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PartnerResponse> {
    return toPartnerResponse(await this.getPartner.execute(this.tenantContext.tenantIdOrThrow(), id));
  }

  @RequirePermissions('tenant.partners.approve')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a pending partner' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerResponseDto })
  async approve(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: ApprovePartnerDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<PartnerResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toPartnerResponse(
      await this.approvePartner.execute(tenantId, id, input, { userId: principal.userId, ip }),
    );
  }

  @RequirePermissions('tenant.partners.approve')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify a partner identity submission' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerResponseDto })
  async verify(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: VerifyIdentityDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toPartnerResponse(
      await this.verifyIdentity.execute(tenantId, id, input, { userId: principal.userId }),
    );
  }

  @RequirePermissions('tenant.partners.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend a partner' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerResponseDto })
  async suspend(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PartnerResponse> {
    return toPartnerResponse(
      await this.suspendPartner.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }
}
