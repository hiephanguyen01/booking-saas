import type { PlanLimits } from '@booking/shared';

export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');

export interface PlanRecord {
  id: string;
  name: string;
  priceMonthly: bigint;
  limits: PlanLimits;
  isActive: boolean;
}

export interface CreatePlanData {
  name: string;
  priceMonthly: bigint;
  limits: PlanLimits;
  isActive: boolean;
}

export interface IPlanRepository {
  create(data: CreatePlanData): Promise<PlanRecord>;
  findById(id: string): Promise<PlanRecord | null>;
  list(): Promise<PlanRecord[]>;
}
