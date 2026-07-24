import { Inject, Injectable } from '@nestjs/common';
import type { CreatePlanInput } from '@booking/contracts';
import { SubscriptionPlan } from '../../domain/entities/subscription-plan.entity';
import {
  PLAN_REPOSITORY,
  type IPlanRepository,
  type PlanRecord,
} from '../../domain/ports/plan-repository.port';

@Injectable()
export class CreatePlanUseCase {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(input: CreatePlanInput): Promise<PlanRecord> {
    const plan = SubscriptionPlan.open({
      name: input.name,
      priceMonthly: BigInt(input.priceMonthly),
      limits: input.limits,
      isActive: input.isActive,
    });
    return this.plans.create(plan);
  }
}
