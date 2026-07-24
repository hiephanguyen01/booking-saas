import type { SubscriptionState } from '../subscription-status';

export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');

export interface SubscriptionRecord {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionState;
  startsAt: Date;
  expiresAt: Date;
  note: string | null;
}

export interface AssignSubscriptionData {
  tenantId: string;
  planId: string;
  status: SubscriptionState;
  startsAt: Date;
  expiresAt: Date;
  note?: string | null;
}

/** A history row with its plan resolved to a name (one join, no N+1). */
export interface SubscriptionHistoryRecord extends SubscriptionRecord {
  planName: string;
}

export interface ISubscriptionRepository {
  create(data: AssignSubscriptionData): Promise<SubscriptionRecord>;
  /**
   * A page of the tenant's subscription history, newest first. Assignment is
   * append-only (§3.1), so this is the tenant's billing history.
   */
  listByTenant(
    tenantId: string,
    params: { page: number; pageSize: number },
  ): Promise<{ items: SubscriptionHistoryRecord[]; total: number }>;
}
