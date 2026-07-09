import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { bookingStatusSchema, uuidSchema, type BookingResponse } from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ListTenantBookingsUseCase } from '../../application/use-cases/list-tenant-bookings.use-case';
import { PartnerBookingStatsUseCase } from '../../application/use-cases/partner-booking-stats.use-case';
import { toBookingResponse } from '../../application/booking.mapper';

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
 * Tenant-side read-only booking overview (Task 1.13). Bookings are advanced by
 * the customer/partner/payment flows; the tenant console only observes them and
 * the resulting partner cancellation / no-show rates (§7.3). Scope via x-tenant-id.
 */
@Controller('tenant/bookings')
export class TenantBookingController {
  constructor(
    private readonly listBookings: ListTenantBookingsUseCase,
    private readonly partnerStats: PartnerBookingStatsUseCase,
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
}
