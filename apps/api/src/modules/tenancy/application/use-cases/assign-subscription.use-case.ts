import { Inject, Injectable } from '@nestjs/common';
import type { AssignSubscriptionInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantSubscription } from '../../domain/entities/tenant-subscription.entity';
import { PlanNotFound } from '../../domain/errors/billing-errors';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/ports/plan-repository.port';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
  type SubscriptionRecord,
} from '../../domain/ports/subscription-repository.port';

/**
 * Platform admin assigns a plan to a tenant (§3.1 — manual invoicing in Phase 1).
 * A new row supersedes the previous subscription (the current reader orders by
 * startsAt then createdAt), preserving history.
 */
@Injectable()
export class AssignSubscriptionUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async execute(tenantId: string, input: AssignSubscriptionInput): Promise<SubscriptionRecord> {
    if (!(await this.tenants.findById(tenantId))) {
      throw new TenantNotFound();
    }
    if (!(await this.plans.findById(input.planId))) {
      throw new PlanNotFound(input.planId);
    }
    // App-clock fallback stays in the use-case — the aggregate reads no clock.
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const expiresAt = new Date(input.expiresAt);
    const subscription = TenantSubscription.assign({
      tenantId,
      planId: input.planId,
      status: input.status,
      startsAt,
      expiresAt,
      note: input.note ?? null,
    });
    return this.subscriptions.create(subscription);
  }
}
