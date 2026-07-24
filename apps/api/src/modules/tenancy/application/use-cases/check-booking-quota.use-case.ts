import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import { checkBookingSoftLimit, type SoftLimitCheck } from '../../domain/plan-limits';
import { GetPlanLimitsUseCase } from './get-plan-limits.use-case';

/**
 * Soft monthly-bookings check (§6.5) — NEVER throws. Its only consumer is
 * `GetSubscriptionStatusUseCase` (within this module), which surfaces the
 * upgrade warning to the dashboard; nothing in `modules/booking` calls this
 * directly, and it must not block the customer.
 */
@Injectable()
export class CheckBookingQuotaUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly getPlanLimits: GetPlanLimitsUseCase,
  ) {}

  async execute(tenantId: string, now: Date): Promise<SoftLimitCheck> {
    const limits = await this.getPlanLimits.execute(tenantId);
    if (!limits) return { allowed: true, overLimit: false, limit: 0, current: 0 };
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const current = await this.tenants.countBookingsBetween(tenantId, monthStart, monthEnd);
    return checkBookingSoftLimit(current, limits.maxBookingsPerMonth);
  }
}
