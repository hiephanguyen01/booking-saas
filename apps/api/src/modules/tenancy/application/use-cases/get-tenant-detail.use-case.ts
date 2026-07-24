import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type DomainRecord,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
} from '../../domain/ports/subscription-repository.port';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/ports/plan-repository.port';
import type { SubscriptionState } from '../../domain/subscription-status';

/** Trailing window for the `bookings30d` count. */
const BOOKINGS_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface TenantDetailView {
  tenant: TenantRecord;
  subscription: { planName: string; status: SubscriptionState; expiresAt: Date } | null;
  primaryDomain: DomainRecord | null;
  counts: { partners: number; listings: number; bookings30d: number };
}

/**
 * The platform-admin tenant detail screen (§19). Composes tenancy's own ports —
 * profile, current subscription + its plan, primary domain, and the three volume
 * counts — into one read so the screen needs a single request.
 *
 * `bookings30d` reads booking rows through {@link ITenantRepository.countBookingsBetween},
 * a read-only aggregate tenancy already owns for the §6.5 quota; no booking-module
 * service is imported (they only ever talk over the outbox).
 */
@Injectable()
export class GetTenantDetailUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
  ) {}

  async execute(id: string, now: Date = new Date()): Promise<TenantDetailView> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new TenantNotFound();
    }

    const from = new Date(now.getTime() - BOOKINGS_WINDOW_DAYS * MS_PER_DAY);
    const [subscription, domains, partners, listings, bookings30d] = await Promise.all([
      this.subscriptions.findCurrentByTenant(id),
      this.domains.listByTenant(id),
      this.tenants.countPartners(id),
      this.tenants.countListings(id),
      this.tenants.countBookingsBetween(id, from, now),
    ]);

    // The plan is only fetched once we know there is a subscription to name.
    const plan = subscription ? await this.plans.findById(subscription.planId) : null;

    return {
      tenant,
      subscription: subscription
        ? {
            // A subscription's plan is a RESTRICT FK, so it cannot dangle; the
            // fallback only guards a manually-tampered row.
            planName: plan?.name ?? 'Unknown plan',
            status: subscription.status,
            expiresAt: subscription.expiresAt,
          }
        : null,
      primaryDomain: domains.find((d) => d.isPrimary) ?? null,
      counts: { partners, listings, bookings30d },
    };
  }
}
