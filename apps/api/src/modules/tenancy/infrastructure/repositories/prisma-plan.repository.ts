import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PlanLimits } from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { BILLABLE_SUBSCRIPTION_STATUSES } from '../../domain/subscription-status';
import type {
  CreatePlanData,
  IPlanRepository,
  PlanRecord,
  UpdatePlanData,
} from '../../domain/ports/plan-repository.port';

type PrismaPlan = Prisma.SubscriptionPlanGetPayload<Record<string, never>>;

function toRecord(p: PrismaPlan): PlanRecord {
  return {
    id: p.id,
    name: p.name,
    priceMonthly: p.priceMonthly,
    limits: (p.limits ?? {}) as unknown as PlanLimits,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Statuses still within their paid-through date count as billable — derived from
 * the domain rule so the SQL below cannot drift from {@link evaluateSubscription}.
 * Values are bound as parameters and compared against `status::text`.
 */
const BILLABLE_STATUSES_SQL = Prisma.join([...BILLABLE_SUBSCRIPTION_STATUSES]);

interface SubscriberCountRow {
  plan_id: string;
  subscribers: number;
}

@Injectable()
export class PrismaPlanRepository implements IPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePlanData): Promise<PlanRecord> {
    return toRecord(
      await this.prisma.admin.subscriptionPlan.create({
        data: {
          name: data.name,
          priceMonthly: data.priceMonthly,
          limits: data.limits as unknown as Prisma.InputJsonValue,
          isActive: data.isActive,
        },
      }),
    );
  }

  async findById(id: string): Promise<PlanRecord | null> {
    const p = await this.prisma.admin.subscriptionPlan.findUnique({ where: { id } });
    return p ? toRecord(p) : null;
  }

  async findByName(name: string): Promise<PlanRecord | null> {
    const p = await this.prisma.admin.subscriptionPlan.findUnique({ where: { name } });
    return p ? toRecord(p) : null;
  }

  async list(): Promise<PlanRecord[]> {
    const plans = await this.prisma.admin.subscriptionPlan.findMany({ orderBy: { name: 'asc' } });
    return plans.map(toRecord);
  }

  async update(id: string, data: UpdatePlanData): Promise<PlanRecord> {
    return toRecord(
      await this.prisma.admin.subscriptionPlan.update({
        where: { id },
        data: {
          name: data.name,
          priceMonthly: data.priceMonthly,
          limits: data.limits as unknown as Prisma.InputJsonValue | undefined,
          isActive: data.isActive,
        },
      }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.prisma.admin.subscriptionPlan.delete({ where: { id } });
  }

  /**
   * Collapse each tenant to its current subscription (latest by `starts_at`, the
   * same rule `findCurrentByTenant` uses, with `created_at` as a deterministic
   * tiebreak), keep only the ones still inside their paid-through window, then
   * count tenants per plan. `DISTINCT ON` is what makes this a *subscriber* count
   * rather than a subscription-row count.
   */
  async liveSubscriberCounts(): Promise<Map<string, number>> {
    const rows = await this.prisma.admin.$queryRaw<SubscriberCountRow[]>(Prisma.sql`
      SELECT cur.plan_id, COUNT(*)::int AS subscribers
      FROM (
        SELECT DISTINCT ON (s.tenant_id)
          s.tenant_id, s.plan_id, s.status::text AS status, s.expires_at
        FROM tenant_subscriptions s
        ORDER BY s.tenant_id, s.starts_at DESC, s.created_at DESC
      ) cur
      WHERE cur.status IN (${BILLABLE_STATUSES_SQL})
        AND cur.expires_at > now()
      GROUP BY cur.plan_id`);
    return new Map(rows.map((r) => [r.plan_id, r.subscribers]));
  }

  countSubscriptions(planId: string): Promise<number> {
    return this.prisma.admin.tenantSubscription.count({ where: { planId } });
  }
}
