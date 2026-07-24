import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PlanLimits } from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
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

  countSubscriptions(planId: string): Promise<number> {
    return this.prisma.admin.tenantSubscription.count({ where: { planId } });
  }
}
