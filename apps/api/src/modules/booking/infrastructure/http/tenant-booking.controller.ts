import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  bookingStatusSchema,
  reasonInputSchema,
  uuidSchema,
  type BookingResponse,
  type CancelBookingResponse,
  type ReasonInput,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { ListTenantBookingsUseCase } from '../../application/use-cases/list-tenant-bookings.use-case';
import { PartnerBookingStatsUseCase } from '../../application/use-cases/partner-booking-stats.use-case';
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
import { CancelBookingUseCase } from '../../application/use-cases/cancel-booking.use-case';
import { toBookingResponse, toCancelResponse } from '../../application/booking.mapper';

/** Query filters for the tenant booking overview (Task 1.13). */
const tenantBookingsQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  partnerId: uuidSchema.optional(),
});
type TenantBookingsQuery = z.infer<typeof tenantBookingsQuerySchema>;

/** Partner booking health for the tenant dashboard — counts plus derived rates. */
interface PartnerBookingStatsResponse {
  partnerId: string;
  total: number;
  cancelled: number;
  noShow: number;
  completed: number;
  confirmed: number;
  /** 0–1 fractions; 0 when the partner has no bookings yet. */
  cancellationRate: number;
  noShowRate: number;
}

/**
 * Tenant-side booking overview (Task 1.13). Bookings are advanced by the
 * customer/partner/payment flows; the tenant console observes them, the partner
 * cancellation / no-show rates (§7.3), and can cancel a booking (a tenant cancel
 * is always a 100% refund, §8.2). Scope via x-tenant-id.
 */
@Controller('tenant/bookings')
export class TenantBookingController {
  constructor(
    private readonly listBookings: ListTenantBookingsUseCase,
    private readonly partnerStats: PartnerBookingStatsUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.bookings.read')
  @Get()
  async list(
    @Query(new ZodValidationPipe(tenantBookingsQuerySchema)) query: TenantBookingsQuery,
  ): Promise<BookingResponse[]> {
    const items = await this.listBookings.execute(this.tenantContext.tenantIdOrThrow(), {
      status: query.status,
      partnerId: query.partnerId,
    });
    return items.map(toBookingResponse);
  }

  @RequirePermissions('tenant.bookings.read')
  @Get('partner-stats')
  async partnerBookingStats(): Promise<PartnerBookingStatsResponse[]> {
    const stats = await this.partnerStats.execute(this.tenantContext.tenantIdOrThrow());
    return stats.map((s) => ({
      ...s,
      cancellationRate: s.total > 0 ? s.cancelled / s.total : 0,
      noShowRate: s.total > 0 ? s.noShow / s.total : 0,
    }));
  }

  /** Single booking for the tenant detail view (Task 1.13). */
  @RequirePermissions('tenant.bookings.read')
  @Get(':id')
  async detail(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<BookingResponse> {
    return toBookingResponse(await this.getBooking.execute(this.tenantContext.tenantIdOrThrow(), id));
  }

  /** Tenant cancels a booking — always a 100% refund regardless of policy (§8.2). */
  @RequirePermissions('tenant.bookings.cancel')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(reasonInputSchema)) body: ReasonInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<CancelBookingResponse> {
    const result = await this.cancelBooking.execute(this.tenantContext.tenantIdOrThrow(), id, 'tenant', {
      actorId: principal.userId,
      reason: body.reason,
    });
    return toCancelResponse(result);
  }
}
