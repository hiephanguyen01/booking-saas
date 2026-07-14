import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createPromotionInputSchema,
  updatePromotionInputSchema,
  uuidSchema,
  type CreatePromotionInput,
  type PromotionResponse,
  type PromoUsageStatsResponse,
  type UpdatePromotionInput,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreatePromotionUseCase } from '../../application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from '../../application/use-cases/update-promotion.use-case';
import { EndPromotionUseCase } from '../../application/use-cases/end-promotion.use-case';
import { ListPromotionsUseCase } from '../../application/use-cases/list-promotions.use-case';
import { PromoUsageStatsUseCase } from '../../application/use-cases/promo-usage-stats.use-case';
import { toPromotionResponse, toUsageStatsResponse } from '../../application/promotion.mapper';

/** Tenant-side promotion management (§12.2). Scope via x-tenant-id. */
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
  async list(): Promise<PromotionResponse[]> {
    const items = await this.listPromotions.execute(this.tenantContext.tenantIdOrThrow());
    return items.map(toPromotionResponse);
  }

  @RequirePermissions('tenant.promotions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  async create(
    @Body(new ZodValidationPipe(createPromotionInputSchema)) input: CreatePromotionInput,
  ): Promise<PromotionResponse> {
    return toPromotionResponse(await this.createPromotion.execute(this.tenantContext.tenantIdOrThrow(), input));
  }

  @RequirePermissions('tenant.promotions.manage')
  @Get(':id/usage-stats')
  async stats(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PromoUsageStatsResponse> {
    const { promotion, stats } = await this.usageStats.execute(this.tenantContext.tenantIdOrThrow(), id);
    return toUsageStatsResponse(promotion, stats);
  }

  @RequirePermissions('tenant.promotions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updatePromotionInputSchema)) input: UpdatePromotionInput,
  ): Promise<PromotionResponse> {
    return toPromotionResponse(await this.updatePromotion.execute(this.tenantContext.tenantIdOrThrow(), id, input));
  }

  @RequirePermissions('tenant.promotions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/end')
  async end(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PromotionResponse> {
    return toPromotionResponse(await this.endPromotion.execute(this.tenantContext.tenantIdOrThrow(), id));
  }
}
