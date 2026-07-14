import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  uuidSchema,
  type BookingResponse,
  type CancelBookingResponse,
  type ReturnBookingResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { PartnerBookingUseCase } from '../../application/use-cases/partner-booking.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { InventoryFulfillmentUseCase } from '../../application/use-cases/inventory-fulfillment.use-case';
import { PartnerCalendarUseCase } from '../../application/use-cases/partner-calendar.use-case';
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
import { toBookingResponse, toCancelResponse, toReturnResponse } from '../../application/booking.mapper';
import {
  toPartnerCalendarResponse,
  type PartnerCalendarBookingResponse,
} from '../../application/partner-calendar.mapper';
import {
  BookingResponseDto,
  CalendarRangeQueryDto,
  CancelBookingResponseDto,
  MarkReturnedDto,
  PartnerCalendarBookingResponseDto,
  ReasonDto,
  ReturnBookingResponseDto,
} from './dto/booking.dto';

/** Partner-side booking management (§8.2). Scope via x-partner-id. */
@ApiTags('partner-bookings')
@Controller('partner/bookings')
export class PartnerBookingController {
  constructor(
    private readonly partnerBooking: PartnerBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly fulfillment: InventoryFulfillmentUseCase,
    private readonly calendar: PartnerCalendarUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Single booking (Task 1.14 detail view) — 404 unless it's this partner's. */
  @RequirePermissions('partner.bookings.read')
  @Get(':id')
  @ApiOperation({ summary: "Get one of the partner's bookings by id" })
  @UuidParam()
  @ApiOkResponse({ type: BookingResponseDto })
  async detail(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<BookingResponse> {
    const booking = await this.getBooking.execute(this.tenantContext.tenantIdOrThrow(), id, {
      partnerId: this.tenantContext.partnerIdOrThrow(),
    });
    return toBookingResponse(booking);
  }

  private ctx(principal: SessionPrincipal) {
    return {
      tenantId: this.tenantContext.tenantIdOrThrow(),
      partnerId: this.tenantContext.partnerIdOrThrow(),
      actorId: principal.userId,
    };
  }

  /**
   * Master-calendar feed (Task 1.14): every booking across the partner's
   * resources overlapping `[from,to)`, with listing title + type for rendering
   * and client-side filtering.
   */
  @RequirePermissions('partner.bookings.read')
  @Get()
  @ApiOperation({ summary: "Partner master-calendar feed across the partner's resources" })
  @ApiOkResponse({ type: [PartnerCalendarBookingResponseDto] })
  async calendarFeed(
    @Query() query: CalendarRangeQueryDto,
  ): Promise<PartnerCalendarBookingResponse[]> {
    const bookings = await this.calendar.execute({
      tenantId: this.tenantContext.tenantIdOrThrow(),
      partnerId: this.tenantContext.partnerIdOrThrow(),
      from: new Date(query.from),
      to: new Date(query.to),
    });
    return bookings.map(toPartnerCalendarResponse);
  }

  @RequirePermissions('partner.bookings.approve')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a pending booking' })
  @UuidParam()
  @ApiOkResponse({ type: BookingResponseDto })
  async approve(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.partnerBooking.approve(this.ctx(principal), id));
  }

  @RequirePermissions('partner.bookings.approve')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a pending booking' })
  @UuidParam()
  @ApiOkResponse({ type: BookingResponseDto })
  async reject(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.partnerBooking.reject(this.ctx(principal), id, body.reason));
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/no-show')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a confirmed booking as a no-show' })
  @UuidParam()
  @ApiOkResponse({ type: BookingResponseDto })
  async noShow(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.partnerBooking.markNoShow(this.ctx(principal), id, body.reason));
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Partner cancels a booking (computes the refund)' })
  @UuidParam()
  @ApiOkResponse({ type: CancelBookingResponseDto })
  async cancel(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<CancelBookingResponse> {
    const ctx = this.ctx(principal);
    const result = await this.cancelBooking.execute(ctx.tenantId, id, 'partner', {
      actorId: ctx.actorId,
      reason: body.reason,
    });
    return toCancelResponse(result);
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/pick-up')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark an inventory rental as picked up' })
  @UuidParam()
  @ApiOkResponse({ type: BookingResponseDto })
  async pickUp(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.fulfillment.markPickedUp(this.ctx(principal), id));
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/return')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark an inventory rental returned + inspected' })
  @UuidParam()
  @ApiOkResponse({ type: ReturnBookingResponseDto })
  async return(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: MarkReturnedDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<ReturnBookingResponse> {
    return toReturnResponse(await this.fulfillment.markReturned(this.ctx(principal), id, BigInt(body.damageAmount)));
  }
}
