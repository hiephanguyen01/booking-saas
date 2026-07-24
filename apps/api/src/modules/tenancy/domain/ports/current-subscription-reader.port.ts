import type { PlanRecord } from './plan-repository.port';
import type { SubscriptionRecord } from './subscription-repository.port';

export const CURRENT_SUBSCRIPTION_READER = Symbol('CURRENT_SUBSCRIPTION_READER');

export interface CurrentSubscriptionRecord {
  subscription: SubscriptionRecord;
  plan: PlanRecord;
}

export interface CurrentSubscriptionSelection {
  current: CurrentSubscriptionRecord | null;
  /** PostgreSQL `now()` captured by the same statement that selected current. */
  evaluatedAt: Date;
}

export interface CurrentSubscriptionsSnapshot {
  items: CurrentSubscriptionRecord[];
  /** One PostgreSQL transaction timestamp shared by every row in `items`. */
  evaluatedAt: Date;
}

/**
 * The one read model allowed to define "current subscription".
 *
 * Current = latest `starts_at`, then latest `created_at`. Liveness is evaluated
 * against `evaluatedAt`; consumers must not substitute an application clock.
 */
export interface ICurrentSubscriptionReader {
  findByTenant(tenantId: string): Promise<CurrentSubscriptionSelection>;
  listCurrent(): Promise<CurrentSubscriptionsSnapshot>;
  liveSubscriberCounts(): Promise<Map<string, number>>;
}
