import { Injectable } from '@nestjs/common';
import { GetCurrentSubscriptionUseCase } from './get-current-subscription.use-case';
import { PlanLimitService } from '../services/plan-limit.service';
import {
  evaluateSubscription,
  type SubscriptionEvaluation,
  type SubscriptionState,
} from '../../domain/subscription-status';

export interface SubscriptionStatusView {
  /** null when the tenant has never been subscribed. */
  status: SubscriptionState | null;
  expiresAt: Date | null;
  evaluation: SubscriptionEvaluation;
  /** Soft monthly-bookings quota; null when the tenant has no active plan. */
  bookingQuota: { used: number; limit: number; overLimit: boolean } | null;
}

/**
 * Tenant-facing subscription snapshot for the dashboard read-only banner (§6.5).
 * Combines the current subscription's lifecycle phase with the soft
 * booking-quota warning — the latter NEVER blocks checkout; it only informs the
 * dashboard, so it is surfaced here rather than on the booking-create path.
 */
@Injectable()
export class GetSubscriptionStatusUseCase {
  constructor(
    private readonly getCurrent: GetCurrentSubscriptionUseCase,
    private readonly planLimits: PlanLimitService,
  ) {}

  async execute(tenantId: string, now: Date): Promise<SubscriptionStatusView> {
    const current = await this.getCurrent.execute(tenantId);
    const snapshot = current
      ? {
          status: current.subscription.status,
          startsAt: current.subscription.startsAt,
          expiresAt: current.subscription.expiresAt,
        }
      : null;
    const evaluation = evaluateSubscription(snapshot, now);

    const quota = await this.planLimits.checkBookingQuota(tenantId, now);
    const bookingQuota = current
      ? { used: quota.current, limit: quota.limit, overLimit: quota.overLimit }
      : null;

    return {
      status: current?.subscription.status ?? null,
      expiresAt: current?.subscription.expiresAt ?? null,
      evaluation,
      bookingQuota,
    };
  }
}
