import { uuidSchema, type PromotionResponse } from '@booking/contracts';
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPromotionResponse } from '../../application/promotion.mapper';
import { CreatePartnerPromotionUseCase } from '../../application/use-cases/create-partner-promotion.use-case';
import { UpdatePartnerPromotionUseCase } from '../../application/use-cases/update-partner-promotion.use-case';
import { EndPartnerPromotionUseCase } from '../../application/use-cases/end-partner-promotion.use-case';
import { ListPartnerPromotionsUseCase } from '../../application/use-cases/list-partner-promotions.use-case';
import { ListPendingOptInUseCase } from '../../application/use-cases/list-pending-optin.use-case';
import { OptInPromotionUseCase } from '../../application/use-cases/opt-in-promotion.use-case';
import { PartnerPromotionsEnabledGuard } from './guards/partner-promotions-enabled.guard';
import { CreatePartnerPromotionDto, PromotionResponseDto, UpdatePartnerPromotionDto } from './dto/promotions.dto';

/**
 * Partner-side promotions (§12.2 Phase 2). Every route needs the
 * `partner.promotions.manage` permission AND the tenant's per-tenant toggle
 * (`PartnerPromotionsEnabledGuard`). Partner/tenant resolved from the session scope.
 */
@ApiTags('partner-promotions')
@UseGuards(PartnerPromotionsEnabledGuard)
@Controller('partner/promotions')
export class PartnerPromotionController {
  constructor(
    private readonly createPromotion: CreatePartnerPromotionUseCase,
    private readonly updatePromotion: UpdatePartnerPromotionUseCase,
    private readonly endPromotion: EndPartnerPromotionUseCase,
    private readonly listPromotions: ListPartnerPromotionsUseCase,
    private readonly listPending: ListPendingOptInUseCase,
    private readonly optIn: OptInPromotionUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private scope(): { tenantId: string; partnerId: string } {
    return { tenantId: this.tenantContext.tenantIdOrThrow(), partnerId: this.tenantContext.partnerIdOrThrow() };
  }

  @RequirePermissions('partner.promotions.manage')
  @Get()
  @ApiOperation({ summary: "List the partner's own promotions" })
  @ApiOkResponse({ type: [PromotionResponseDto] })
  async list(): Promise<PromotionResponse[]> {
    const { tenantId, partnerId } = this.scope();
    const items = await this.listPromotions.execute(tenantId, partnerId);
    return items.map(toPromotionResponse);
  }

  @RequirePermissions('partner.promotions.manage')
  @Get('pending-optin')
  @ApiOperation({ summary: 'Tenant-created partner-funded promos awaiting this partner’s opt-in' })
  @ApiOkResponse({ type: [PromotionResponseDto] })
  async pending(): Promise<PromotionResponse[]> {
    const { tenantId, partnerId } = this.scope();
    const items = await this.listPending.execute(tenantId, partnerId);
    return items.map(toPromotionResponse);
  }

  @RequirePermissions('partner.promotions.manage')
  @Post()
  @ApiOperation({ summary: 'Create a partner-funded promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  async create(@Body() input: CreatePartnerPromotionDto): Promise<PromotionResponse> {
    const { tenantId, partnerId } = this.scope();
    return toPromotionResponse(await this.createPromotion.execute(tenantId, partnerId, input));
  }

  @RequirePermissions('partner.promotions.manage')
  @Patch(':id')
  @UuidParam()
  @ApiOperation({ summary: 'Update the partner’s own promotion' })
  @ApiOkResponse({ type: PromotionResponseDto })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdatePartnerPromotionDto,
  ): Promise<PromotionResponse> {
    const { tenantId, partnerId } = this.scope();
    return toPromotionResponse(await this.updatePromotion.execute(tenantId, partnerId, id, input));
  }

  @RequirePermissions('partner.promotions.manage')
  @Post(':id/end')
  @UuidParam()
  @ApiOperation({ summary: 'End the partner’s own promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  async end(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<PromotionResponse> {
    const { tenantId, partnerId } = this.scope();
    return toPromotionResponse(await this.endPromotion.execute(tenantId, partnerId, id));
  }

  @RequirePermissions('partner.promotions.manage')
  @Post(':id/opt-in')
  @UuidParam()
  @ApiOperation({ summary: 'Opt in to fund a tenant-created partner-funded promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  async accept(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Req() req: Request,
  ): Promise<PromotionResponse> {
    const { tenantId, partnerId } = this.scope();
    return toPromotionResponse(
      await this.optIn.execute(tenantId, partnerId, id, { userId: principal.userId, ip: req.ip ?? null }),
    );
  }
}
