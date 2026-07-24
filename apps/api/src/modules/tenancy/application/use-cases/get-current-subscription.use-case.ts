import { Inject, Injectable } from '@nestjs/common';
import {
  type SubscriptionRecord,
} from '../../domain/ports/subscription-repository.port';
import {
  type PlanWithSubscribers,
} from '../../domain/ports/plan-repository.port';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';

export interface CurrentSubscriptionView {
  subscription: SubscriptionRecord;
  plan: PlanWithSubscribers;
  evaluatedAt: Date;
}

/**
 * Platform admin reads a tenant's current subscription (the latest by startsAt)
 * together with its plan, for the tenant detail screen (Task 1.12). Returns null
 * when the tenant has never been subscribed.
 */
@Injectable()
export class GetCurrentSubscriptionUseCase {
  constructor(
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
  ) {}

  async execute(tenantId: string): Promise<CurrentSubscriptionView | null> {
    const [selection, counts] = await Promise.all([
      this.currentSubscriptions.findByTenant(tenantId),
      this.currentSubscriptions.liveSubscriberCounts(),
    ]);
    if (!selection.current) return null;
    return {
      subscription: selection.current.subscription,
      plan: {
        plan: selection.current.plan,
        subscriberCount: counts.get(selection.current.plan.id) ?? 0,
      },
      evaluatedAt: selection.evaluatedAt,
    };
  }
}
