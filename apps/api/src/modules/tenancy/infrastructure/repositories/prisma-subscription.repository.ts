import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  AssignSubscriptionData,
  ISubscriptionRepository,
  SubscriptionHistoryRecord,
  SubscriptionRecord,
} from '../../domain/ports/subscription-repository.port';

type PrismaSubscription = Prisma.TenantSubscriptionGetPayload<Record<string, never>>;
type PrismaSubscriptionWithPlan = Prisma.TenantSubscriptionGetPayload<{
  include: { plan: { select: { name: true } } };
}>;

function toRecord(s: PrismaSubscription): SubscriptionRecord {
  return {
    id: s.id,
    tenantId: s.tenantId,
    planId: s.planId,
    status: s.status,
    startsAt: s.startsAt,
    expiresAt: s.expiresAt,
    note: s.note,
  };
}

@Injectable()
export class PrismaSubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: AssignSubscriptionData): Promise<SubscriptionRecord> {
    return toRecord(
      await this.prisma.admin.tenantSubscription.create({
        data: {
          tenantId: data.tenantId,
          planId: data.planId,
          status: data.status,
          startsAt: data.startsAt,
          expiresAt: data.expiresAt,
          note: data.note ?? null,
        },
      }),
    );
  }

  async findCurrentByTenant(tenantId: string): Promise<SubscriptionRecord | null> {
    const s = await this.prisma.admin.tenantSubscription.findFirst({
      where: { tenantId },
      orderBy: { startsAt: 'desc' },
    });
    return s ? toRecord(s) : null;
  }

  async listByTenant(tenantId: string): Promise<SubscriptionHistoryRecord[]> {
    const rows = await this.prisma.admin.tenantSubscription.findMany({
      where: { tenantId },
      // Newest first, matching `findCurrentByTenant`'s notion of "current" —
      // so the first row of the history IS the current subscription.
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: { plan: { select: { name: true } } },
    });
    return rows.map((s: PrismaSubscriptionWithPlan) => ({
      ...toRecord(s),
      planName: s.plan.name,
    }));
  }
}
