import {
  uuidSchema,
  type Paginated,
  type PromotionCategoryOption,
  type PromotionDetailResponse,
  type PromotionResponse,
  type PromoUsageStatsResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { PaginationQueryDto } from '../../../../shared/pagination/pagination.dto';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import {
  toPromotionCategoryOption,
  toPromotionDetailResponse,
  toPromotionResponse,
  toUsageStatsResponse,
} from '../../application/promotion.mapper';
import { CreatePromotionUseCase } from '../../application/use-cases/create-promotion.use-case';
import { EndPromotionUseCase } from '../../application/use-cases/end-promotion.use-case';
import { GetPromotionUseCase } from '../../application/use-cases/get-promotion.use-case';
import { ListPromotionCategoriesUseCase } from '../../application/use-cases/list-promotion-categories.use-case';
import { ListPromotionsUseCase } from '../../application/use-cases/list-promotions.use-case';
import { PromoUsageStatsUseCase } from '../../application/use-cases/promo-usage-stats.use-case';
import { UpdatePromotionUseCase } from '../../application/use-cases/update-promotion.use-case';
import {
  CreatePromotionDto,
  PromotionCategoryOptionDto,
  PromotionDetailResponseDto,
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
    private readonly getPromotion: GetPromotionUseCase,
    private readonly listCategories: ListPromotionCategoriesUseCase,
    private readonly usageStats: PromoUsageStatsUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.promotions.manage')
  @Get()
  @ApiOperation({ summary: 'List all promotions for the tenant' })
  @ApiPaginatedResponse(PromotionResponseDto)
  async list(@Query() query: PaginationQueryDto): Promise<Paginated<PromotionResponse>> {
    const result = await this.listPromotions.execute(this.tenantContext.tenantIdOrThrow(), query);
    return toPaginated(query, result, toPromotionResponse);
  }

  /**
   * Declared before `:id` so the literal segment wins the route match. Lives on this
   * controller (rather than a `/tenant/categories` resource) because it exists purely to
   * populate the promotion scope picker and is authorised by the promotion permission;
   * a canonical category resource belongs to the catalog context.
   */
  @RequirePermissions('tenant.promotions.manage')
  @Get('categories')
  @ApiOperation({ summary: 'Tenant categories — the options behind the `category` promotion scope' })
  @ApiOkResponse({ type: [PromotionCategoryOptionDto] })
  async categories(): Promise<PromotionCategoryOption[]> {
    const items = await this.listCategories.execute(this.tenantContext.tenantIdOrThrow());
    return items.map(toPromotionCategoryOption);
  }

  @RequirePermissions('tenant.promotions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiOperation({ summary: 'Create a promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  async create(@Body() input: CreatePromotionDto): Promise<PromotionResponse> {
    return toPromotionResponse(
      await this.createPromotion.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }

  @RequirePermissions('tenant.promotions.manage')
  @Get(':id/usage-stats')
  @UuidParam()
  @ApiOperation({ summary: 'Usage statistics for a promotion' })
  @ApiOkResponse({ type: PromoUsageStatsResponseDto })
  async stats(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PromoUsageStatsResponse> {
    const { promotion, stats } = await this.usageStats.execute(
      this.tenantContext.tenantIdOrThrow(),
      id,
    );
    return toUsageStatsResponse(promotion, stats);
  }

  @RequirePermissions('tenant.promotions.manage')
  @Get(':id')
  @UuidParam()
  @ApiOperation({ summary: 'Read one promotion' })
  @ApiOkResponse({ type: PromotionDetailResponseDto })
  async detail(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PromotionDetailResponse> {
    return toPromotionDetailResponse(
      await this.getPromotion.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
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
    return toPromotionResponse(
      await this.updatePromotion.execute(this.tenantContext.tenantIdOrThrow(), id, input),
    );
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
    return toPromotionResponse(
      await this.endPromotion.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }
}
