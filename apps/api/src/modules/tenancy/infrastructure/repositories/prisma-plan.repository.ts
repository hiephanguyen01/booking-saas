import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlanLimits } from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  CreatePlanData,
  IPlanRepository,
  PlanRecord,
} from '../../domain/ports/plan-repository.port';

type PrismaPlan = Prisma.SubscriptionPlanGetPayload<Record<string, never>>;

function toRecord(p: PrismaPlan): PlanRecord {
  return {
    id: p.id,
    name: p.name,
    priceMonthly: p.priceMonthly,
    limits: (p.limits ?? {}) as unknown as PlanLimits,
    isActive: p.isActive,
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

  async list(): Promise<PlanRecord[]> {
    const plans = await this.prisma.admin.subscriptionPlan.findMany({ orderBy: { name: 'asc' } });
    return plans.map(toRecord);
  }
}
