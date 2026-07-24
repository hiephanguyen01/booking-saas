import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  uuidSchema,
  type CheckoutResponse,
  type PaymentStatusResponse,
  type PublicPaymentOptions,
} from '@booking/contracts';
import { MissingHost } from '../../../../shared/http/request-boundary-errors';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { CheckoutUseCase } from '../../application/use-cases/checkout.use-case';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case';
import { GetPublicPaymentOptionsUseCase } from '../../application/use-cases/get-public-payment-options.use-case';
import {
  CheckoutResponseDto,
  PaymentStatusResponseDto,
  PublicPaymentOptionsDto,
  StartCheckoutDto,
} from './dto/payments.dto';

/** Storefront payment (§11.2). Tenant resolved from Host (BFF). */
@ApiTags('public-payments')
@Controller('public')
export class PublicPaymentController {
  constructor(
    private readonly checkout: CheckoutUseCase,
    private readonly paymentStatus: GetPaymentStatusUseCase,
    private readonly paymentOptions: GetPublicPaymentOptionsUseCase,
  ) {}

  @Public()
  @Get('payment-options')
  @ApiOperation({ summary: 'List the tenant-enabled storefront payment methods' })
  @ApiOkResponse({ type: PublicPaymentOptionsDto })
  options(@Req() req: Request): Promise<PublicPaymentOptions> {
    return this.paymentOptions.execute(hostOf(req));
  }

  @Public()
  @Post('bookings/:id/checkout')
  @ApiOperation({ summary: 'Start checkout for a booking and get the gateway payment URL' })
  @UuidParam()
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  async startCheckout(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: StartCheckoutDto,
    @Req() req: Request,
  ): Promise<CheckoutResponse> {
    return this.checkout.execute(hostOf(req), id, input.paymentMethod);
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
  if (!raw) throw new MissingHost();
  return raw;
}
