import { BadRequestException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { uuidSchema, type CheckoutResponse, type PaymentStatusResponse } from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { CheckoutUseCase } from '../../application/use-cases/checkout.use-case';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case';
import { CheckoutResponseDto, PaymentStatusResponseDto } from './dto/payments.dto';

/** Storefront payment (§11.2). Tenant resolved from Host (BFF). */
@ApiTags('public-payments')
@Controller('public')
export class PublicPaymentController {
  constructor(
    private readonly checkout: CheckoutUseCase,
    private readonly paymentStatus: GetPaymentStatusUseCase,
  ) {}

  @Public()
  @Post('bookings/:id/checkout')
  @ApiOperation({ summary: 'Start checkout for a booking and get the gateway payment URL' })
  @UuidParam()
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  async startCheckout(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Req() req: Request,
  ): Promise<CheckoutResponse> {
    return this.checkout.execute(hostOf(req), id);
  }

  @Public()
  @Get('bookings/:code/payment-status')
  @ApiOperation({ summary: 'Get the payment status for a booking by code' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: PaymentStatusResponseDto })
  async status(@Param('code') code: string, @Req() req: Request): Promise<PaymentStatusResponse> {
    return this.paymentStatus.execute(hostOf(req), code);
  }
}

function hostOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
    req.headers.host;
  if (!raw)
    throw new BadRequestException({
      statusCode: 400,
      code: 'MISSING_HOST',
      message: 'Host header is required',
    });
  return raw;
}
