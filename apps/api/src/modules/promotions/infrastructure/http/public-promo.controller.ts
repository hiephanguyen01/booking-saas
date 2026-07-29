import {
  type AutoCampaignResponse,
  type StorefrontPromotionsResponse,
  type ValidatePromoResponse,
} from '@booking/contracts';
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MissingHost } from '../../../../shared/http/request-boundary-errors';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ValidatePromoUseCase } from '../../application/use-cases/validate-promo.use-case';
import { ResolveAutoCampaignUseCase } from '../../application/use-cases/resolve-auto-campaign.use-case';
import { ListStorefrontPromotionsUseCase } from '../../application/use-cases/list-storefront-promotions.use-case';
import {
  AutoCampaignDto,
  AutoCampaignResponseDto,
  StorefrontPromotionDto,
  StorefrontPromotionsDto,
  ValidatePromoDto,
  ValidatePromoResponseDto,
} from './dto/promotions.dto';

/** Storefront promo validation (§12.3) + auto-campaign resolution (§12.1). Tenant from Host (BFF). */
@ApiTags('public-checkout')
@Controller('public/checkout')
export class PublicPromoController {
  constructor(
    private readonly validatePromo: ValidatePromoUseCase,
    private readonly autoCampaign: ResolveAutoCampaignUseCase,
    private readonly listStorefrontPromotions: ListStorefrontPromotionsUseCase,
  ) {}

  @Public()
  @Post('validate-promo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate a promo code against a storefront checkout' })
  @ApiOkResponse({ type: ValidatePromoResponseDto })
  async validate(
    @Body() input: ValidatePromoDto,
    @Req() req: Request,
  ): Promise<ValidatePromoResponse> {
    return this.validatePromo.execute(hostOf(req), input);
  }

  @Public()
  @Post('promotions')
  @HttpCode(200)
  @ApiOperation({ summary: 'List discoverable promo codes evaluated for a storefront checkout' })
  @ApiOkResponse({ type: [StorefrontPromotionDto] })
  async promotions(
    @Body() input: StorefrontPromotionsDto,
    @Req() req: Request,
  ): Promise<StorefrontPromotionsResponse> {
    return this.listStorefrontPromotions.execute(hostOf(req), input);
  }

  @Public()
  @Post('auto-campaigns')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve the best auto-applied campaign for a storefront slot' })
  @ApiOkResponse({ type: AutoCampaignResponseDto })
  async resolveAuto(
    @Body() input: AutoCampaignDto,
    @Req() req: Request,
  ): Promise<AutoCampaignResponse> {
    return this.autoCampaign.execute(hostOf(req), input);
  }
}

function hostOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
    req.headers.host;
  if (!raw) throw new MissingHost();
  return raw;
}
