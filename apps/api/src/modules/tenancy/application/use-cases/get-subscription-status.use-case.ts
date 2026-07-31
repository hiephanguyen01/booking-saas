import { Injectable } from '@nestjs/common';
import { GetCurrentSubscriptionUseCase } from './get-current-subscription.use-case';
import { CheckBookingQuotaUseCase } from './check-booking-quota.use-case';
import { GetTenantUseCase } from './get-tenant.use-case';
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
  /** false → the storefront is dark because required legal documents are unpublished (§7). */
  legalReady: boolean;
  /** How many of the four required documents are published in the tenant's default language. */
  legalDocumentsReady: number;
}

/**
 * Tenant-facing subscription snapshot for the dashboard read-only banner (§6.5).
 * Combines the current subscription's lifecycle phase with the soft
 * booking-quota warning — the latter NEVER blocks checkout; it only informs the
 * dashboard, so it is surfaced here rather than on the booking-create path.
 * Also surfaces legal-document readiness (§7) alongside it, purely as a read of
 * the tenant row the legal-readiness outbox handler already stamped — this
 * use-case never computes readiness itself.
 */
@Injectable()
export class GetSubscriptionStatusUseCase {
  constructor(
    private readonly getCurrent: GetCurrentSubscriptionUseCase,
    private readonly checkBookingQuota: CheckBookingQuotaUseCase,
    private readonly getTenant: GetTenantUseCase,
  ) {}

  async execute(tenantId: string): Promise<SubscriptionStatusView> {
    const current = await this.getCurrent.execute(tenantId);
    const tenant = await this.getTenant.execute(tenantId);
    const snapshot = current
      ? {
          status: current.subscription.status,
          startsAt: current.subscription.startsAt,
          expiresAt: current.subscription.expiresAt,
        }
      : null;
    // No subscription always evaluates expired, independent of the clock. A
    // present subscription carries the DB clock captured with its selection.
    const evaluation = evaluateSubscription(snapshot, current?.evaluatedAt ?? new Date(0));

    const quota = current
      ? await this.checkBookingQuota.execute(tenantId, current.evaluatedAt)
      : null;
    const bookingQuota = quota
      ? { used: quota.current, limit: quota.limit, overLimit: quota.overLimit }
      : null;

    return {
      status: current?.subscription.status ?? null,
      expiresAt: current?.subscription.expiresAt ?? null,
      evaluation,
      bookingQuota,
      legalReady: tenant.legalReadyAt !== null,
      legalDocumentsReady: tenant.legalDocumentsReady,
    };
  }
}
