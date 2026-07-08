import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PlanLimits } from '@booking/shared';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
} from '../../domain/ports/subscription-repository.port';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/ports/plan-repository.port';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import {
  checkBookingSoftLimit,
  checkHardLimit,
  type SoftLimitCheck,
} from '../../domain/plan-limits';

/**
 * Enforces subscription_plans.limits (§6.5). Hard limits (partners, listings)
 * throw before a create; the monthly-bookings limit is soft — callers use
 * {@link checkBookingQuota} to warn without ever blocking a checkout.
 *
 * Runs on the admin pool via the repositories (counts are cross-cutting and the
 * plan lives on tenant-level tables); intended to back a PlanLimitGuard.
 */
@Injectable()
export class PlanLimitService {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  /** The active plan's limits, or null when the tenant has no assigned plan. */
  async getLimits(tenantId: string): Promise<PlanLimits | null> {
    const sub = await this.subscriptions.findCurrentByTenant(tenantId);
    if (!sub) return null;
    const plan = await this.plans.findById(sub.planId);
    return plan?.limits ?? null;
  }

  async assertCanAddPartner(tenantId: string): Promise<void> {
    const limits = await this.requireLimits(tenantId);
    const current = await this.tenants.countPartners(tenantId);
    if (!checkHardLimit(current, limits.maxPartners).allowed) {
      throw this.limitReached('maxPartners', limits.maxPartners);
    }
  }

  async assertCanAddListing(tenantId: string): Promise<void> {
    const limits = await this.requireLimits(tenantId);
    const current = await this.tenants.countListings(tenantId);
    if (!checkHardLimit(current, limits.maxListings).allowed) {
      throw this.limitReached('maxListings', limits.maxListings);
    }
  }

  async assertCustomDomainAllowed(tenantId: string): Promise<void> {
    const limits = await this.requireLimits(tenantId);
    if (limits.customDomain !== true) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_FEATURE_DISABLED',
        message: 'The current plan does not include custom domains',
      });
    }
  }

  /**
   * Soft monthly-bookings check (§6.5) — NEVER throws. The booking module calls
   * this to surface an upgrade warning; it must not block the customer.
   */
  async checkBookingQuota(tenantId: string, now: Date): Promise<SoftLimitCheck> {
    const limits = await this.getLimits(tenantId);
    if (!limits) return { allowed: true, overLimit: false, limit: 0, current: 0 };
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const current = await this.tenants.countBookingsBetween(tenantId, monthStart, monthEnd);
    return checkBookingSoftLimit(current, limits.maxBookingsPerMonth);
  }

  private async requireLimits(tenantId: string): Promise<PlanLimits> {
    const limits = await this.getLimits(tenantId);
    if (!limits) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NO_ACTIVE_PLAN',
        message: 'Tenant has no active subscription plan',
      });
    }
    return limits;
  }

  private limitReached(key: string, limit: number): ForbiddenException {
    return new ForbiddenException({
      statusCode: 403,
      code: 'PLAN_LIMIT_REACHED',
      message: `Plan limit reached for ${key} (max ${limit})`,
    });
  }
}
