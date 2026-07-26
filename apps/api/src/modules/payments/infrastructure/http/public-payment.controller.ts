import {
  uuidSchema,
  type CheckoutResponse,
  type PaymentStatusResponse,
  type PublicPaymentOptions,
} from '@booking/contracts';
import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { MissingHost } from '../../../../shared/http/request-boundary-errors';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { ResolveBookingAccessUseCase } from '../../../booking/application/use-cases/resolve-booking-access.use-case';
import { BookingAccessDenied } from '../../../booking/domain/errors/booking-domain-errors';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { OptionalPrincipal } from '../../../identity-access/infrastructure/http/decorators/optional-principal.decorator';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
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
    private readonly resolveBookingAccess: ResolveBookingAccessUseCase,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
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
  @ApiOperation({ summary: 'Start checkout for an accessible booking' })
  @UuidParam()
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  async startCheckout(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: StartCheckoutDto,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Headers('x-booking-code') bookingCode?: string,
    @Headers('x-booking-access-grant') accessGrant?: string,
    @Headers('x-booking-otp') otp?: string,
  ): Promise<CheckoutResponse> {
    if (!bookingCode) throw new BookingAccessDenied();

    const host = hostOf(req);
    const tenant = await this.resolveTenant.execute(host);
    const booking = await this.resolveBookingAccess.execute(tenant.id, bookingCode, {
      accessGrant,
      otp,
      sessionUserId: principal?.userId,
    });
    if (booking.id !== id) throw new BookingAccessDenied();

    return this.checkout.execute(host, id, input.paymentMethod);
  }

  @Public()
  @Get('bookings/:code/payment-status')
  @ApiOperation({ summary: 'Get payment status for an accessible booking' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: PaymentStatusResponseDto })
  async status(
    @Param('code') code: string,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Headers('x-booking-access-grant') accessGrant?: string,
    @Headers('x-booking-otp') otp?: string,
  ): Promise<PaymentStatusResponse> {
    const host = hostOf(req);
    const tenant = await this.resolveTenant.execute(host);
    await this.resolveBookingAccess.execute(tenant.id, code, {
      accessGrant,
      otp,
      sessionUserId: principal?.userId,
    });
    return this.paymentStatus.execute(host, code);
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
