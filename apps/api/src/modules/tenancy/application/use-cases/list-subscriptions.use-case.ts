import { Inject, Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
  type SubscriptionHistoryRecord,
} from '../../domain/ports/subscription-repository.port';

/**
 * A tenant's full subscription history, newest first (§19). Assignment is
 * append-only, so this is the billing trail an admin needs to answer "what were
 * they on, and when did it change?" — `GET /admin/tenants/:id/subscription`
 * only ever shows the current one.
 */
@Injectable()
export class ListSubscriptionsUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async execute(
    tenantId: string,
    query: PaginationQuery,
  ): Promise<RepoPage<SubscriptionHistoryRecord>> {
    // Distinguish "tenant does not exist" (404) from "tenant never subscribed" (empty page).
    if (!(await this.tenants.findById(tenantId))) {
      throw new TenantNotFound();
    }
    return this.subscriptions.listByTenant(tenantId, query);
  }
}
