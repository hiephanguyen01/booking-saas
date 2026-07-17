import {
  type BookingOtpResponse,
  type BookingResponse,
  type CancelBookingResponse
} from '@booking/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { OptionalPrincipal } from '../../../identity-access/infrastructure/http/decorators/optional-principal.decorator';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { toCancelResponse, toCustomerBookingResponse } from '../../application/booking.mapper';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { ConfirmBookingUseCase } from '../../application/use-cases/confirm-booking.use-case';
import { CreateBookingUseCase } from '../../application/use-cases/create-booking.use-case';
import { GetBookingByCodeUseCase } from '../../application/use-cases/get-booking-by-code.use-case';
import { ListMyBookingsUseCase } from '../../application/use-cases/list-my-bookings.use-case';
import { RequestBookingOtpUseCase } from '../../application/use-cases/request-booking-otp.use-case';
import { ResolveBookingAccessUseCase } from '../../application/use-cases/resolve-booking-access.use-case';
import {
  BookingResponseDto,
  CreateBookingDto,
  BookingOtpResponseDto,
  CancelBookingResponseDto,
  CancelBookingDto,
} from './dto/booking.dto';

// Fail CLOSED: an explicit opt-in only — never inferred from NODE_ENV (which is
// unset in many shared/preview envs, which would expose free confirmations).
const MOCK_PAY_ENABLED = process.env.ALLOW_MOCK_PAYMENTS === 'true';

/** Storefront booking (§8/§8.6). Tenant resolved from Host (BFF). */
@ApiTags('public-bookings')
@Controller('public')
export class PublicBookingController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly listMyBookings: ListMyBookingsUseCase,
    private readonly getBookingByCode: GetBookingByCodeUseCase,
    private readonly requestBookingOtp: RequestBookingOtpUseCase,
    private readonly resolveBookingAccess: ResolveBookingAccessUseCase,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
  ) {}

  @Public()
  @Post('bookings')
  @ApiOperation({ summary: 'Create a booking from the storefront' })
  @ApiCreatedResponse({ type: BookingResponseDto })
  async create(
    @Body() input: CreateBookingDto,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BookingResponse> {
    const booking = await this.createBooking.execute(hostOf(req), input, {
      customerUserId: principal?.userId,
      idempotencyKey: idempotencyKey ?? randomUUID(),
    });
    return toCustomerBookingResponse(booking);
  }

  @AuthenticatedOnly()
  @Get('my-bookings')
  @ApiOperation({ summary: "The current customer's bookings for this tenant" })
  @ApiOkResponse({ type: [BookingResponseDto] })
  async myBookings(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Req() req: Request,
  ): Promise<BookingResponse[]> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    const bookings = await this.listMyBookings.execute(tenant.id, principal.userId);
    return bookings.map(toCustomerBookingResponse);
  }

  @Public()
  @Post('bookings/:code/request-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request an email OTP to access a booking by code' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: BookingOtpResponseDto })
  async requestOtp(@Param('code') code: string, @Req() req: Request): Promise<BookingOtpResponse> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    return this.requestBookingOtp.execute(tenant.id, code);
  }

  @Public()
  @Get('bookings/:code')
  @ApiOperation({ summary: 'View a booking by code (session or OTP)' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: BookingResponseDto })
  async view(
    @Param('code') code: string,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Query('otp') otp?: string,
  ): Promise<BookingResponse> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    const booking = await this.resolveBookingAccess.execute(tenant.id, code, {
      otp,
      sessionUserId: principal?.userId,
    });
    return toCustomerBookingResponse(booking);
  }

  @Public()
  @Post('bookings/:code/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Customer cancels a booking by code (session or OTP)' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: CancelBookingResponseDto })
  async cancel(
    @Param('code') code: string,
    @Body() body: CancelBookingDto,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
  ): Promise<CancelBookingResponse> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    const sessionUserId = principal?.userId;
    const booking = await this.resolveBookingAccess.execute(tenant.id, code, {
      otp: body.otp,
      sessionUserId,
    });
    const result = await this.cancelBooking.execute(tenant.id, booking.id, 'customer', {
      actorId: sessionUserId,
      reason: body.reason,
    });
    return toCancelResponse(result);
  }

  /** Dev-only payment simulation (§11 mock); Task 1.9 replaces it with a signed webhook. */
  @Public()
  @Post('bookings/:code/mock-pay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dev-only: simulate a successful payment for a booking' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: BookingResponseDto })
  async mockPay(@Param('code') code: string, @Req() req: Request): Promise<BookingResponse> {
    if (!MOCK_PAY_ENABLED) {
      throw new NotFoundException({ statusCode: 404, code: 'NOT_FOUND', message: 'Not found' });
    }
    const tenant = await this.resolveTenant.execute(hostOf(req));
    const booking = await this.getBookingByCode.execute(tenant.id, code);
    return toCustomerBookingResponse(await this.confirmBooking.execute(tenant.id, booking.id));
  }
}

function hostOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
    req.headers.host;
  if (!raw) {
    throw new BadRequestException({
      statusCode: 400,
      code: 'MISSING_HOST',
      message: 'Host header is required',
    });
  }
  return raw;
}
