import {
  uuidSchema,
  type ManualRefundBookingResponse,
  type ManualRefundStatusResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { MissingHost } from '../../../../shared/http/request-boundary-errors';
import { THROTTLE_PROFILE_WRITE } from '../../../../shared/http/throttle-limits';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { ResolveBookingAccessUseCase } from '../../../booking/application/use-cases/resolve-booking-access.use-case';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { OptionalPrincipal } from '../../../identity-access/infrastructure/http/decorators/optional-principal.decorator';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { AcknowledgeCustomerManualRefundReceivedUseCase } from '../../application/use-cases/acknowledge-customer-manual-refund-received.use-case';
import { GetCustomerManualRefundStatusUseCase } from '../../application/use-cases/get-customer-manual-refund-status.use-case';
import { ReportCustomerManualRefundNotReceivedUseCase } from '../../application/use-cases/report-customer-manual-refund-not-received.use-case';
import { SubmitCustomerManualRefundDestinationUseCase } from '../../application/use-cases/submit-customer-manual-refund-destination.use-case';
import { ListCustomerManualRefundsUseCase } from '../../application/use-cases/list-customer-manual-refunds.use-case';
import {
  AcknowledgeManualRefundDto,
  ManualRefundStatusResponseDto,
  SubmitManualRefundDestinationDto,
} from './dto/payments.dto';

@ApiTags('public-manual-refunds')
@Controller('public/bookings/:code/manual-refunds')
export class PublicManualRefundController {
  constructor(
    private readonly getStatus: GetCustomerManualRefundStatusUseCase,
    private readonly submitDestination: SubmitCustomerManualRefundDestinationUseCase,
    private readonly acknowledgeReceived: AcknowledgeCustomerManualRefundReceivedUseCase,
    private readonly reportNotReceived: ReportCustomerManualRefundNotReceivedUseCase,
    private readonly listByBooking: ListCustomerManualRefundsUseCase,
    private readonly resolveBookingAccess: ResolveBookingAccessUseCase,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List masked manual refund operations for an authorized booking' })
  @ApiParam({ name: 'code', type: 'string' })
  @ApiOkResponse({ type: [ManualRefundStatusResponseDto] })
  async list(
    @Param('code') code: string,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Headers('x-booking-access-grant') accessGrant?: string,
  ): Promise<ManualRefundBookingResponse> {
    const access = await this.authorize(req, code, principal, accessGrant);
    return this.listByBooking.execute(access.tenantId, access.bookingId);
  }

  @Public()
  @Get(':operationId')
  @ApiOperation({ summary: 'Get a booking-scoped manual refund status' })
  @ApiParam({ name: 'code', type: 'string' })
  @UuidParam('operationId')
  @ApiOkResponse({ type: ManualRefundStatusResponseDto })
  async status(
    @Param('code') code: string,
    @Param('operationId', new ZodValidationPipe(uuidSchema)) operationId: string,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Headers('x-booking-access-grant') accessGrant?: string,
  ): Promise<ManualRefundStatusResponse> {
    const { tenantId, bookingId, bookingCode } = await this.authorize(
      req,
      code,
      principal,
      accessGrant,
    );
    return this.getStatus.execute(tenantId, bookingId, bookingCode, operationId);
  }

  @Public()
  @Throttle(THROTTLE_PROFILE_WRITE)
  @Post(':operationId/destination')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit or replace a manual refund destination' })
  @ApiParam({ name: 'code', type: 'string' })
  @UuidParam('operationId')
  @ApiOkResponse({ type: ManualRefundStatusResponseDto })
  async destination(
    @Param('code') code: string,
    @Param('operationId', new ZodValidationPipe(uuidSchema)) operationId: string,
    @Body() input: SubmitManualRefundDestinationDto,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Headers('x-booking-access-grant') accessGrant?: string,
  ): Promise<ManualRefundStatusResponse> {
    const access = await this.authorize(req, code, principal, accessGrant);
    let thirdPartyOtpConsentVerified = false;
    if (input.isThirdParty) {
      await this.resolveBookingAccess.execute(access.tenantId, code, { accessGrant });
      thirdPartyOtpConsentVerified = true;
    }
    return this.submitDestination.execute(
      access.tenantId,
      access.bookingId,
      access.bookingCode,
      operationId,
      input,
      { thirdPartyOtpConsentVerified },
    );
  }

  @Public()
  @Throttle(THROTTLE_PROFILE_WRITE)
  @Post(':operationId/acknowledgement')
  @HttpCode(200)
  @ApiOperation({ summary: 'Acknowledge receipt or report a missing manual refund' })
  @ApiParam({ name: 'code', type: 'string' })
  @UuidParam('operationId')
  @ApiOkResponse({ type: ManualRefundStatusResponseDto })
  async acknowledgement(
    @Param('code') code: string,
    @Param('operationId', new ZodValidationPipe(uuidSchema)) operationId: string,
    @Body() input: AcknowledgeManualRefundDto,
    @Req() req: Request,
    @OptionalPrincipal() principal?: SessionPrincipal,
    @Headers('x-booking-access-grant') accessGrant?: string,
  ): Promise<ManualRefundStatusResponse> {
    const access = await this.authorize(req, code, principal, accessGrant);
    if (input.acknowledgement === 'received') {
      return this.acknowledgeReceived.execute(
        access.tenantId,
        access.bookingId,
        access.bookingCode,
        operationId,
        { ...input, acknowledgement: 'received' },
      );
    }
    return this.reportNotReceived.execute(
      access.tenantId,
      access.bookingId,
      access.bookingCode,
      operationId,
      { ...input, acknowledgement: 'not_received' },
    );
  }

  private async authorize(
    req: Request,
    code: string,
    principal: SessionPrincipal | undefined,
    accessGrant: string | undefined,
  ): Promise<{ tenantId: string; bookingId: string; bookingCode: string }> {
    const tenant = await this.resolveTenant.execute(hostOf(req));
    const booking = await this.resolveBookingAccess.execute(tenant.id, code, {
      accessGrant,
      sessionUserId: principal?.userId,
    });
    return { tenantId: tenant.id, bookingId: booking.id, bookingCode: booking.code };
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
