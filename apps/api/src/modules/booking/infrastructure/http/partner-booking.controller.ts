import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  uuidSchema,
  type BookingStatusHistoryResponse,
  type PartnerBookingResponse,
  type PartnerCancelBookingResponse,
  type ReturnBookingResponse,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { ApproveBookingUseCase } from '../../application/use-cases/approve-booking.use-case';
import { RejectBookingUseCase } from '../../application/use-cases/reject-booking.use-case';
import { MarkNoShowUseCase } from '../../application/use-cases/mark-no-show.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { MarkPickedUpUseCase } from '../../application/use-cases/mark-picked-up.use-case';
import { MarkReturnedUseCase } from '../../application/use-cases/mark-returned.use-case';
import { MarkCompletedUseCase } from '../../application/use-cases/mark-completed.use-case';
import { PartnerCalendarUseCase } from '../../application/use-cases/partner-calendar.use-case';
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
import { GetBookingHistoryUseCase } from '../../application/use-cases/get-booking-history.use-case';
import { UpdatePartnerNoteUseCase } from '../../application/use-cases/update-partner-note.use-case';
import {
  toPartnerBookingResponse,
  toPartnerCancelResponse,
  toReturnResponse,
  toStatusHistoryResponse,
} from '../../application/booking.mapper';
import {
  toPartnerCalendarResponse,
  type PartnerCalendarBookingResponse,
} from '../../application/partner-calendar.mapper';
import {
  BookingStatusHistoryResponseDto,
  CalendarRangeQueryDto,
  CompleteBookingDto,
  MarkReturnedDto,
  PartnerBookingResponseDto,
  PartnerCalendarBookingResponseDto,
  PartnerCancelBookingResponseDto,
  PartnerNoteDto,
  ReasonDto,
  ReturnBookingResponseDto,
} from './dto/booking.dto';

/**
 * Partner-side booking management (§8.2). Scope via x-partner-id.
 *
 * **PII boundary (§7.3):** every response here goes through the PARTNER mapper
 * (`toPartnerBookingResponse` / `toPartnerCancelResponse` / `toPartnerCalendarResponse`),
 * never `toBookingResponse` — a partner must not receive the customer's email, nor
 * their unmasked phone before the booking is confirmed. The partner response types
 * are structurally incompatible with the tenant ones, so this is compiler-enforced.
 */
@ApiTags('partner-bookings')
@Controller('partner/bookings')
export class PartnerBookingController {
  constructor(
    private readonly approveBooking: ApproveBookingUseCase,
    private readonly rejectBooking: RejectBookingUseCase,
    private readonly markNoShow: MarkNoShowUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly markPickedUp: MarkPickedUpUseCase,
    private readonly markReturned: MarkReturnedUseCase,
    private readonly markCompleted: MarkCompletedUseCase,
    private readonly calendar: PartnerCalendarUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly bookingHistory: GetBookingHistoryUseCase,
    private readonly partnerNote: UpdatePartnerNoteUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Single booking (Task 1.14 detail view) — 404 unless it's this partner's. */
  @RequirePermissions('partner.bookings.read')
  @Get(':id')
  @ApiOperation({ summary: "Get one of the partner's bookings by id" })
  @UuidParam()
  @ApiOkResponse({ type: PartnerBookingResponseDto })
  async detail(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<PartnerBookingResponse> {
    const booking = await this.getBooking.execute(this.tenantContext.tenantIdOrThrow(), id, {
      partnerId: this.tenantContext.partnerIdOrThrow(),
    });
    return toPartnerBookingResponse(booking);
  }

  /** Transition audit trail for one of the partner's bookings (§8.2). */
  @RequirePermissions('partner.bookings.read')
  @Get(':id/history')
  @ApiOperation({ summary: "Status history of one of the partner's bookings" })
  @UuidParam()
  @ApiOkResponse({ type: [BookingStatusHistoryResponseDto] })
  async history(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<BookingStatusHistoryResponse[]> {
    const history = await this.bookingHistory.execute(this.tenantContext.tenantIdOrThrow(), id, {
      partnerId: this.tenantContext.partnerIdOrThrow(),
    });
    return history.map(toStatusHistoryResponse);
  }

  /** Set/clear the partner's private note on one of their bookings (§8.2). */
  @RequirePermissions('partner.bookings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id/note')
  @ApiOperation({ summary: "Set or clear the partner's private note on a booking" })
  @UuidParam()
  @ApiOkResponse({ type: PartnerBookingResponseDto })
  async setNote(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: PartnerNoteDto,
  ): Promise<PartnerBookingResponse> {
    const note = body.note?.trim();
    const updated = await this.partnerNote.execute(
      {
        tenantId: this.tenantContext.tenantIdOrThrow(),
        partnerId: this.tenantContext.partnerIdOrThrow(),
      },
      id,
      note ? note : null, // blank/omitted clears the note
    );
    return toPartnerBookingResponse(updated);
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
  @ApiOkResponse({ type: PartnerBookingResponseDto })
  async approve(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerBookingResponse> {
    return toPartnerBookingResponse(await this.approveBooking.execute(this.ctx(principal), id));
  }

  @RequirePermissions('partner.bookings.approve')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a pending booking' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerBookingResponseDto })
  async reject(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerBookingResponse> {
    return toPartnerBookingResponse(
      await this.rejectBooking.execute(this.ctx(principal), id, body.reason),
    );
  }

  @RequirePermissions('partner.bookings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/no-show')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a confirmed booking as a no-show' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerBookingResponseDto })
  async noShow(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerBookingResponse> {
    return toPartnerBookingResponse(
      await this.markNoShow.execute(this.ctx(principal), id, body.reason),
    );
  }

  @RequirePermissions('partner.bookings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a service and confirm the amount collected on site' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerBookingResponseDto })
  async complete(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: CompleteBookingDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerBookingResponse> {
    return toPartnerBookingResponse(
      await this.markCompleted.execute(
        this.ctx(principal),
        id,
        BigInt(body.onsiteCollectedAmount),
        body.note,
      ),
    );
  }

  @RequirePermissions('partner.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Partner cancels a booking (computes the refund)' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerCancelBookingResponseDto })
  async cancel(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerCancelBookingResponse> {
    const ctx = this.ctx(principal);
    const result = await this.cancelBooking.execute(ctx.tenantId, id, 'partner', {
      actorId: ctx.actorId,
      reason: body.reason,
    });
    return toPartnerCancelResponse(result);
  }

  @RequirePermissions('partner.bookings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/pick-up')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark an inventory rental as picked up' })
  @UuidParam()
  @ApiOkResponse({ type: PartnerBookingResponseDto })
  async pickUp(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerBookingResponse> {
    return toPartnerBookingResponse(await this.markPickedUp.execute(this.ctx(principal), id));
  }

  @RequirePermissions('partner.bookings.write')
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
    return toReturnResponse(
      await this.markReturned.execute(this.ctx(principal), id, BigInt(body.damageAmount)),
    );
  }
}
