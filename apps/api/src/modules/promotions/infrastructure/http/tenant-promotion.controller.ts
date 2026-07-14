import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  uuidSchema,
  type PromotionResponse,
  type PromoUsageStatsResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreatePromotionUseCase } from '../../application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from '../../application/use-cases/update-promotion.use-case';
import { EndPromotionUseCase } from '../../application/use-cases/end-promotion.use-case';
import { ListPromotionsUseCase } from '../../application/use-cases/list-promotions.use-case';
import { PromoUsageStatsUseCase } from '../../application/use-cases/promo-usage-stats.use-case';
import { toPromotionResponse, toUsageStatsResponse } from '../../application/promotion.mapper';
import {
  CreatePromotionDto,
  PromotionResponseDto,
  PromoUsageStatsResponseDto,
  UpdatePromotionDto,
} from './dto/promotions.dto';

/** Tenant-side promotion management (§12.2). Scope via x-tenant-id. */
@ApiTags('tenant-promotions')
@Controller('tenant/promotions')
export class TenantPromotionController {
  constructor(
    private readonly createPromotion: CreatePromotionUseCase,
    private readonly updatePromotion: UpdatePromotionUseCase,
    private readonly endPromotion: EndPromotionUseCase,
    private readonly listPromotions: ListPromotionsUseCase,
    private readonly usageStats: PromoUsageStatsUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.promotions.manage')
  @Get()
  @ApiOperation({ summary: 'List all promotions for the tenant' })
  @ApiOkResponse({ type: [PromotionResponseDto] })
  async list(): Promise<PromotionResponse[]> {
    const items = await this.listPromotions.execute(this.tenantContext.tenantIdOrThrow());
    return items.map(toPromotionResponse);
  }

  @RequirePermissions('tenant.promotions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiOperation({ summary: 'Create a promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  async create(
    @Body() input: CreatePromotionDto,
  ): Promise<PromotionResponse> {
    return toPromotionResponse(await this.createPromotion.execute(this.tenantContext.tenantIdOrThrow(), input));
  }

  @RequirePermissions('tenant.promotions.manage')
  @Get(':id/usage-stats')
  @UuidParam()
  @ApiOperation({ summary: 'Usage statistics for a promotion' })
  @ApiOkResponse({ type: PromoUsageStatsResponseDto })
  async stats(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PromoUsageStatsResponse> {
    const { promotion, stats } = await this.usageStats.execute(this.tenantContext.tenantIdOrThrow(), id);
    return toUsageStatsResponse(promotion, stats);
  }

  @RequirePermissions('tenant.promotions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  @UuidParam()
  @ApiOperation({ summary: 'Update a promotion' })
  @ApiOkResponse({ type: PromotionResponseDto })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdatePromotionDto,
  ): Promise<PromotionResponse> {
    return toPromotionResponse(await this.updatePromotion.execute(this.tenantContext.tenantIdOrThrow(), id, input));
  }

  @RequirePermissions('tenant.promotions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/end')
  @UuidParam()
  @ApiOperation({ summary: 'End a promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  async end(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PromotionResponse> {
    return toPromotionResponse(await this.endPromotion.execute(this.tenantContext.tenantIdOrThrow(), id));
  }
}
