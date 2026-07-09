import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { validatePromoInputSchema, type ValidatePromoInput, type ValidatePromoResponse } from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ValidatePromoUseCase } from '../../application/use-cases/validate-promo.use-case';

/** Storefront promo validation (§12.3). Tenant resolved from Host (BFF). */
@Controller('public/checkout')
export class PublicPromoController {
  constructor(private readonly validatePromo: ValidatePromoUseCase) {}

  @Public()
  @Post('validate-promo')
  @HttpCode(200)
  async validate(
    @Body(new ZodValidationPipe(validatePromoInputSchema)) input: ValidatePromoInput,
    @Req() req: Request,
  ): Promise<ValidatePromoResponse> {
    return this.validatePromo.execute(hostOf(req), input);
  }
}

function hostOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.headers.host;
  if (!raw) throw new BadRequestException({ statusCode: 400, code: 'MISSING_HOST', message: 'Host header is required' });
  return raw;
}
