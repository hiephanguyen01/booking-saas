import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  AssignSubscriptionData,
  ISubscriptionRepository,
  SubscriptionRecord,
} from '../../domain/ports/subscription-repository.port';

type PrismaSubscription = Prisma.TenantSubscriptionGetPayload<Record<string, never>>;

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
}
