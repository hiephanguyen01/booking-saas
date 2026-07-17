import {
  uuidSchema,
  type BookingStatusHistoryResponse,
  type CancelBookingResponse,
  type Paginated,
  type PartnerBookingStatsResponse,
  type TenantBookingResponse,
} from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import {
  toBookingResponse,
  toCancelResponse,
  toPartnerBookingStatsResponse,
  toStatusHistoryResponse,
} from '../../application/booking.mapper';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
import { GetBookingHistoryUseCase } from '../../application/use-cases/get-booking-history.use-case';
import { ListTenantBookingsUseCase } from '../../application/use-cases/list-tenant-bookings.use-case';
import { PartnerBookingStatsUseCase } from '../../application/use-cases/partner-booking-stats.use-case';
import {
  TenantBookingResponseDto,
  BookingStatusHistoryResponseDto,
  CancelBookingResponseDto,
  PartnerBookingStatsResponseDto,
  ReasonDto,
  TenantBookingsQueryDto,
} from './dto/booking.dto';

/**
 * Tenant-side booking overview (Task 1.13). Bookings are advanced by the
 * customer/partner/payment flows; the tenant console observes them, the partner
 * cancellation / no-show rates (§7.3), and can cancel a booking (a tenant cancel
 * is always a 100% refund, §8.2). Scope via x-tenant-id.
 */
@ApiTags('tenant-bookings')
@Controller('tenant/bookings')
export class TenantBookingController {
  constructor(
    private readonly listBookings: ListTenantBookingsUseCase,
    private readonly partnerStats: PartnerBookingStatsUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly bookingHistory: GetBookingHistoryUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Offset-paginated. `status` / `partnerId` are honoured SERVER-side alongside
   * `page` / `pageSize` — filtering one page client-side makes every derived count
   * wrong past the page boundary.
   */
  @RequirePermissions('tenant.bookings.read')
  @Get()
  @ApiOperation({ summary: 'List bookings across the tenant' })
  @ApiPaginatedResponse(TenantBookingResponseDto)
  async list(@Query() query: TenantBookingsQueryDto): Promise<Paginated<TenantBookingResponse>> {
    const result = await this.listBookings.execute(this.tenantContext.tenantIdOrThrow(), {
      status: query.status,
      partnerId: query.partnerId,
      page: query.page,
      pageSize: query.pageSize,
    });
    return toPaginated(query, result, toBookingResponse);
  }

  @RequirePermissions('tenant.bookings.read')
  @Get('partner-stats')
  @ApiOperation({ summary: 'Per-partner booking health (cancellation / no-show rates)' })
  @ApiOkResponse({ type: [PartnerBookingStatsResponseDto] })
  async partnerBookingStats(): Promise<PartnerBookingStatsResponse[]> {
    const stats = await this.partnerStats.execute(this.tenantContext.tenantIdOrThrow());
    return stats.map(toPartnerBookingStatsResponse);
  }

  /** Single booking for the tenant detail view (Task 1.13). */
  @RequirePermissions('tenant.bookings.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant booking by id' })
  @UuidParam()
  @ApiOkResponse({ type: TenantBookingResponseDto })
  async detail(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<TenantBookingResponse> {
    return toBookingResponse(
      await this.getBooking.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }

  /**
   * Transition audit trail (§8.2) — every status change with its actor and the
   * reason typed at the time (including the customer's own cancellation reason).
   */
  @RequirePermissions('tenant.bookings.read')
  @Get(':id/history')
  @ApiOperation({ summary: "Status history of a tenant's booking" })
  @UuidParam()
  @ApiOkResponse({ type: [BookingStatusHistoryResponseDto] })
  async history(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<BookingStatusHistoryResponse[]> {
    const history = await this.bookingHistory.execute(this.tenantContext.tenantIdOrThrow(), id);
    return history.map(toStatusHistoryResponse);
  }

  /** Tenant cancels a booking — always a 100% refund regardless of policy (§8.2). */
  @RequirePermissions('tenant.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tenant cancels a booking (always a 100% refund)' })
  @UuidParam()
  @ApiOkResponse({ type: CancelBookingResponseDto })
  async cancel(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<CancelBookingResponse> {
    const result = await this.cancelBooking.execute(
      this.tenantContext.tenantIdOrThrow(),
      id,
      'tenant',
      {
        actorId: principal.userId,
        reason: body.reason,
      },
    );
    return toCancelResponse(result);
  }
}
