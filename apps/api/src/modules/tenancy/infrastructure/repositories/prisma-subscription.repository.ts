import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { pageOffset } from '../../../../shared/pagination/pagination';
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

  async listByTenant(
    tenantId: string,
    params: { page: number; pageSize: number },
  ): Promise<{ items: SubscriptionHistoryRecord[]; total: number }> {
    // Platform/admin read scoped by the :id tenant path param — this is the
    // BYPASSRLS admin pool (no `forTenant`), so the tenantId filter is explicit.
    const where: Prisma.TenantSubscriptionWhereInput = { tenantId };
    const { skip, take } = pageOffset(params);
    const [rows, total] = await Promise.all([
      this.prisma.admin.tenantSubscription.findMany({
        where,
        // History uses the same deterministic precedence as the dedicated
        // current-subscription reader.
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        include: { plan: { select: { name: true } } },
        skip,
        take,
      }),
      this.prisma.admin.tenantSubscription.count({ where }),
    ]);
    return {
      items: rows.map((s: PrismaSubscriptionWithPlan) => ({
        ...toRecord(s),
        planName: s.plan.name,
      })),
      total,
    };
  }
}
