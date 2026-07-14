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
  Inject,
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
import {
  SESSION_STORE,
  type ISessionStore,
} from '../../../identity-access/domain/ports/session-store.port';
import { ACCESS_COOKIE } from '../../../identity-access/infrastructure/http/cookies';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { toBookingResponse, toCancelResponse } from '../../application/booking.mapper';
import { BookingLookupUseCase } from '../../application/use-cases/booking-lookup.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { ConfirmBookingUseCase } from '../../application/use-cases/confirm-booking.use-case';
import { CreateBookingUseCase } from '../../application/use-cases/create-booking.use-case';
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
    private readonly lookup: BookingLookupUseCase,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  @Public()
  @Post('bookings')
  @ApiOperation({ summary: 'Create a booking from the storefront' })
  @ApiCreatedResponse({ type: BookingResponseDto })
  async create(
    @Body() input: CreateBookingDto,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BookingResponse> {
    const booking = await this.createBooking.execute(hostOf(req), input, {
      customerUserId: await this.optionalUserId(req),
      idempotencyKey: idempotencyKey ?? randomUUID(),
    });
    return toBookingResponse(booking);
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
    const bookings = await this.lookup.listMyBookings(tenant.id, principal.userId);
    return bookings.map(toBookingResponse);
  }

  @Public()
  @Post('bookings/:code/request-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request an email OTP to access a booking by code' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: BookingOtpResponseDto })
  async requestOtp(@Param('code') code: string, @Req() req: Request): Promise<BookingOtpResponse> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    return this.lookup.requestOtp(tenant.id, code);
  }

  @Public()
  @Get('bookings/:code')
  @ApiOperation({ summary: 'View a booking by code (session or OTP)' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: BookingResponseDto })
  async view(
    @Param('code') code: string,
    @Req() req: Request,
    @Query('otp') otp?: string,
  ): Promise<BookingResponse> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    const booking = await this.lookup.resolveForAccess(tenant.id, code, {
      otp,
      sessionUserId: await this.optionalUserId(req),
    });
    return toBookingResponse(booking);
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
  ): Promise<CancelBookingResponse> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    const sessionUserId = await this.optionalUserId(req);
    const booking = await this.lookup.resolveForAccess(tenant.id, code, {
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
    const booking = await this.lookup.byCode(tenant.id, code);
    return toBookingResponse(await this.confirmBooking.execute(tenant.id, booking.id));
  }

  private async optionalUserId(req: Request): Promise<string | undefined> {
    const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) return undefined;
    const principal = await this.sessions.findByAccessToken(token);
    return principal && principal.status === 'active' ? principal.userId : undefined;
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
