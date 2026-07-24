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
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';
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
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
  ) {}

  async execute(id: string, now: Date = new Date()): Promise<TenantDetailView> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new TenantNotFound();
    }

    const from = new Date(now.getTime() - BOOKINGS_WINDOW_DAYS * MS_PER_DAY);
    const [selection, domains, partners, listings, bookings30d] = await Promise.all([
      this.currentSubscriptions.findByTenant(id),
      this.domains.listByTenant(id),
      this.tenants.countPartners(id),
      this.tenants.countListings(id),
      this.tenants.countBookingsBetween(id, from, now),
    ]);

    const current = selection.current;

    return {
      tenant,
      subscription: current
        ? {
            planName: current.plan.name,
            status: current.subscription.status,
            expiresAt: current.subscription.expiresAt,
          }
        : null,
      primaryDomain: domains.find((d) => d.isPrimary) ?? null,
      counts: { partners, listings, bookings30d },
    };
  }
}
