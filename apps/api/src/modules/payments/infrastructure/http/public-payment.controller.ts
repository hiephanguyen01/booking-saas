import { BadRequestException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { uuidSchema, type CheckoutResponse, type PaymentStatusResponse } from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { CheckoutUseCase } from '../../application/use-cases/checkout.use-case';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case';

/** Storefront payment (§11.2). Tenant resolved from Host (BFF). */
@Controller('public')
export class PublicPaymentController {
  constructor(
    private readonly checkout: CheckoutUseCase,
    private readonly paymentStatus: GetPaymentStatusUseCase,
  ) {}

  @Public()
  @Post('bookings/:id/checkout')
  async startCheckout(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Req() req: Request,
  ): Promise<CheckoutResponse> {
    return this.checkout.execute(hostOf(req), id);
  }

  @Public()
  @Get('bookings/:code/payment-status')
  async status(@Param('code') code: string, @Req() req: Request): Promise<PaymentStatusResponse> {
    return this.paymentStatus.execute(hostOf(req), code);
  }
}

function hostOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.headers.host;
  if (!raw) throw new BadRequestException({ statusCode: 400, code: 'MISSING_HOST', message: 'Host header is required' });
  return raw;
}
