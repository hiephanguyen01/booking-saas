import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  uuidSchema,
  type AffiliateDetailResponse,
  type AffiliateListItem,
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
  toAffiliateCommissionResponse,
  toAffiliateListItem,
  toReferralLinkResponse,
} from '../../application/affiliate.mapper';
import {
  AffiliateDetailResponseDto,
  AffiliateListItemDto,
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
    return rows.map((r) => toAffiliateListItem(r.affiliate, { linksCount: r.linksCount, totalEarned: r.totalEarned }));
  }

  @RequirePermissions('tenant.affiliates.manage')
  @Get(':id')
  @UuidParam()
  @ApiOperation({ summary: 'Affiliate detail: profile + links + commissions' })
  @ApiOkResponse({ type: AffiliateDetailResponseDto })
  async detail(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<AffiliateDetailResponse> {
    const d = await this.getAffiliate.execute(this.tenantContext.tenantIdOrThrow(), id);
    return {
      affiliate: toAffiliateListItem(d.affiliate, { linksCount: d.links.length, totalEarned: d.totalEarned }),
      links: d.links.map(toReferralLinkResponse),
      commissions: d.commissions.map(toAffiliateCommissionResponse),
    };
  }

  @RequirePermissions('tenant.affiliates.manage')
  @Post(':id/status')
  @UuidParam()
  @ApiOperation({ summary: 'Approve or suspend an affiliate' })
  @ApiOkResponse({ type: AffiliateListItemDto })
  async status(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: TenantAffiliateStatusDto,
  ): Promise<{ id: string; status: string }> {
    const updated = await this.setStatus.execute(this.tenantContext.tenantIdOrThrow(), id, input.status);
    return { id: updated.id, status: updated.status };
  }

  @RequirePermissions('tenant.affiliates.manage')
  @Patch(':id')
  @UuidParam()
  @ApiOperation({ summary: "Set or clear an affiliate's custom commission rate" })
  @ApiOkResponse({ type: AffiliateListItemDto })
  async updateCustomRate(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: TenantUpdateAffiliateDto,
  ): Promise<{ id: string; customRate: string | null }> {
    const customRate = input.customRate === null ? null : BigInt(input.customRate);
    const updated = await this.updateRate.execute(this.tenantContext.tenantIdOrThrow(), id, customRate);
    return { id: updated.id, customRate: updated.customRate === null ? null : updated.customRate.toString() };
  }
}
