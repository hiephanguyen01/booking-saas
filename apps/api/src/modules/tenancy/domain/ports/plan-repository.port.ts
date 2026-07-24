import type { PlanLimits } from '@booking/contracts';

export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');

export interface PlanRecord {
  id: string;
  name: string;
  priceMonthly: bigint;
  limits: PlanLimits;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A plan paired with its live subscriber count — the two halves the admin plan
 * response needs (the count is what MRR is derived from). Kept out of
 * {@link PlanRecord} so `findById`, which backs the hot plan-limit path, never
 * pays for an aggregate nobody on that path reads.
 */
export interface PlanWithSubscribers {
  plan: PlanRecord;
  subscriberCount: number;
}

export interface CreatePlanData {
  name: string;
  priceMonthly: bigint;
  limits: PlanLimits;
  isActive: boolean;
}

/** Partial plan edit. Undefined fields are left untouched. */
export interface UpdatePlanData {
  name?: string;
  priceMonthly?: bigint;
  limits?: PlanLimits;
  isActive?: boolean;
}

export interface IPlanRepository {
  create(data: CreatePlanData): Promise<PlanRecord>;
  findById(id: string): Promise<PlanRecord | null>;
  /** `subscription_plans.name` is UNIQUE — checked before an update so the DB's
   *  unique violation never surfaces as a raw Prisma error. */
  findByName(name: string): Promise<PlanRecord | null>;
  list(): Promise<PlanRecord[]>;
  update(id: string, data: UpdatePlanData): Promise<PlanRecord>;
  delete(id: string): Promise<void>;
  /**
   * Total `tenant_subscriptions` rows referencing the plan, in *any* status.
   * The FK is RESTRICT, so a plan with history cannot be hard-deleted at all —
   * this lets the use case answer with a clean 409 instead of a Prisma P2003.
   */
  countSubscriptions(planId: string): Promise<number>;
}
