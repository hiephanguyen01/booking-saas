import { Inject, Injectable } from '@nestjs/common';
import {
  PLAN_REPOSITORY,
  type IPlanRepository,
  type PlanRecord,
} from '../../domain/ports/plan-repository.port';

@Injectable()
export class ListPlansUseCase {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  execute(): Promise<PlanRecord[]> {
    return this.plans.list();
  }
}
