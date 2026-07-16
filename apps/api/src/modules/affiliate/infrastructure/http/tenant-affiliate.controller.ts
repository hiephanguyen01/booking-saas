import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  uuidSchema,
  type AffiliateDetailResponse,
  type AffiliateListItem,
  type AffiliateRateResponse,
  type AffiliateStatusResponse,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ListTenantAffiliatesUseCase } from '../../application/use-cases/list-tenant-affiliates.use-case';
import { GetTenantAffiliateUseCase } from '../../application/use-cases/get-tenant-affiliate.use-case';
import { SetAffiliateStatusUseCase } from '../../application/use-cases/set-affiliate-status.use-case';
import { UpdateAffiliateRateUseCase } from '../../application/use-cases/update-affiliate-rate.use-case';
import {
  toAffiliateDetailResponse,
  toAffiliateRateResponse,
  toAffiliateStatusResponse,
  toTenantAffiliateListItem,
} from '../../application/affiliate.mapper';
import {
  AffiliateDetailResponseDto,
  AffiliateListItemDto,
  AffiliateRateResponseDto,
  AffiliateStatusResponseDto,
  TenantAffiliateStatusDto,
  TenantUpdateAffiliateDto,
} from './dto/affiliate.dto';

/** Tenant-side affiliate management (§15.3). Scope via x-tenant-id + RBAC. */
@ApiTags('tenant-affiliates')
@Controller('tenant/affiliates')
export class TenantAffiliateController {
  constructor(
    private readonly listAffiliates: ListTenantAffiliatesUseCase,
    private readonly getAffiliate: GetTenantAffiliateUseCase,
    private readonly setStatus: SetAffiliateStatusUseCase,
    private readonly updateRate: UpdateAffiliateRateUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.affiliates.manage')
  @Get()
  @ApiOperation({ summary: 'List the tenant affiliates' })
  @ApiOkResponse({ type: [AffiliateListItemDto] })
  async list(): Promise<AffiliateListItem[]> {
    const rows = await this.listAffiliates.execute(this.tenantContext.tenantIdOrThrow());
    return rows.map(toTenantAffiliateListItem);
  }

  @RequirePermissions('tenant.affiliates.manage')
  @Get(':id')
  @UuidParam()
  @ApiOperation({ summary: 'Affiliate detail: profile + links + commissions' })
  @ApiOkResponse({ type: AffiliateDetailResponseDto })
  async detail(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<AffiliateDetailResponse> {
    return toAffiliateDetailResponse(
      await this.getAffiliate.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }

  @RequirePermissions('tenant.affiliates.manage')
  @Post(':id/status')
  @UuidParam()
  @ApiOperation({ summary: 'Approve or suspend an affiliate' })
  @ApiOkResponse({ type: AffiliateStatusResponseDto })
  async status(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: TenantAffiliateStatusDto,
  ): Promise<AffiliateStatusResponse> {
    return toAffiliateStatusResponse(
      await this.setStatus.execute(this.tenantContext.tenantIdOrThrow(), id, input.status),
    );
  }

  @RequirePermissions('tenant.affiliates.manage')
  @Patch(':id')
  @UuidParam()
  @ApiOperation({ summary: "Set or clear an affiliate's custom commission rate" })
  @ApiOkResponse({ type: AffiliateRateResponseDto })
  async updateCustomRate(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: TenantUpdateAffiliateDto,
  ): Promise<AffiliateRateResponse> {
    const { affiliate, effectiveRate } = await this.updateRate.execute(
      this.tenantContext.tenantIdOrThrow(),
      id,
      input.customRate,
    );
    return toAffiliateRateResponse(affiliate, effectiveRate);
  }
}
