import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/ports/plan-repository.port';

/**
 * Deletes a subscription plan (§19) — the escape hatch for a plan created by
 * mistake, since `name` is UNIQUE and would otherwise stay burned forever.
 *
 * Deleting is only ever allowed for a plan nothing references:
 *  - **live subscribers** → 409 `PLAN_HAS_SUBSCRIBERS`. Dropping the plan out from
 *    under a paying tenant would strip its limits and its price.
 *  - **historical subscriptions only** → 409 `PLAN_HAS_SUBSCRIPTION_HISTORY`. The
 *    plan FK is RESTRICT, so the row physically cannot be removed without taking
 *    the billing history with it; deactivating (`PATCH { isActive: false }`) is the
 *    correct move and keeps the trail intact.
 *
 * Both are checked in the application layer so the caller gets an actionable 409
 * instead of a leaked Prisma foreign-key error.
 */
@Injectable()
export class DeletePlanUseCase {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(id: string): Promise<void> {
    if (!(await this.plans.findById(id))) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PLAN_NOT_FOUND',
        message: `Plan ${id} not found`,
      });
    }

    const [liveCounts, totalSubscriptions] = await Promise.all([
      this.plans.liveSubscriberCounts(),
      this.plans.countSubscriptions(id),
    ]);

    const live = liveCounts.get(id) ?? 0;
    if (live > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PLAN_HAS_SUBSCRIBERS',
        message:
          `Cannot delete a plan with ${live} live subscriber(s). Migrate them to another plan ` +
          `first, or deactivate this one with PATCH { isActive: false } to hide it from new ` +
          `assignments.`,
        details: { subscribers: live },
      });
    }

    if (totalSubscriptions > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PLAN_HAS_SUBSCRIPTION_HISTORY',
        message:
          `Cannot delete a plan that ${totalSubscriptions} past subscription(s) still reference — ` +
          `it would destroy their billing history. Deactivate it with PATCH { isActive: false } ` +
          `instead.`,
        details: { subscriptions: totalSubscriptions },
      });
    }

    await this.plans.delete(id);
  }
}
