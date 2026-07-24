import { Injectable } from '@nestjs/common';
import { Prisma, type Prisma as PrismaTypes } from '@prisma/client';
import type { PlanLimits } from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { evaluateSubscription } from '../../domain/subscription-status';
import type {
  CurrentSubscriptionRecord,
  CurrentSubscriptionSelection,
  CurrentSubscriptionsSnapshot,
  ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';

interface CurrentSubscriptionRow {
  subscription_id: string | null;
  tenant_id: string | null;
  plan_id: string | null;
  subscription_status: 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled' | null;
  starts_at: Date | null;
  expires_at: Date | null;
  note: string | null;
  plan_name: string | null;
  price_monthly: bigint | null;
  limits: PrismaTypes.JsonValue | null;
  plan_is_active: boolean | null;
  plan_created_at: Date | null;
  plan_updated_at: Date | null;
  evaluated_at: Date;
}

function toRecord(row: CurrentSubscriptionRow): CurrentSubscriptionRecord | null {
  if (
    !row.subscription_id ||
    !row.tenant_id ||
    !row.plan_id ||
    !row.subscription_status ||
    !row.starts_at ||
    !row.expires_at ||
    !row.plan_name ||
    row.price_monthly === null ||
    row.plan_is_active === null ||
    !row.plan_created_at ||
    !row.plan_updated_at
  ) {
    return null;
  }
  return {
    subscription: {
      id: row.subscription_id,
      tenantId: row.tenant_id,
      planId: row.plan_id,
      status: row.subscription_status,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      note: row.note,
    },
    plan: {
      id: row.plan_id,
      name: row.plan_name,
      priceMonthly: row.price_monthly,
      limits: (row.limits ?? {}) as PlanLimits,
      isActive: row.plan_is_active,
      createdAt: row.plan_created_at,
      updatedAt: row.plan_updated_at,
    },
  };
}

/**
 * Admin-pool read projection for the append-only subscription stream.
 *
 * Both the per-tenant and platform-wide paths execute this exact CTE, so row
 * precedence, resolved plan data and PostgreSQL clock cannot drift again.
 */
@Injectable()
export class PrismaCurrentSubscriptionReader implements ICurrentSubscriptionReader {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(tenantId: string): Promise<CurrentSubscriptionSelection> {
    const snapshot = await this.query(tenantId);
    return { current: snapshot.items[0] ?? null, evaluatedAt: snapshot.evaluatedAt };
  }

  listCurrent(): Promise<CurrentSubscriptionsSnapshot> {
    return this.query();
  }

  async liveSubscriberCounts(): Promise<Map<string, number>> {
    const { items, evaluatedAt } = await this.query();
    const counts = new Map<string, number>();
    for (const item of items) {
      if (evaluateSubscription(item.subscription, evaluatedAt).phase !== 'active') continue;
      counts.set(item.plan.id, (counts.get(item.plan.id) ?? 0) + 1);
    }
    return counts;
  }

  private async query(tenantId?: string): Promise<CurrentSubscriptionsSnapshot> {
    const tenantFilter = tenantId
      ? Prisma.sql`WHERE s.tenant_id = ${tenantId}::uuid`
      : Prisma.empty;
    const rows = await this.prisma.admin.$queryRaw<CurrentSubscriptionRow[]>(Prisma.sql`
      WITH clock AS (
        SELECT now() AS evaluated_at
      ),
      current_subscriptions AS (
        SELECT DISTINCT ON (s.tenant_id)
          s.id AS subscription_id,
          s.tenant_id,
          s.plan_id,
          s.status::text AS subscription_status,
          s.starts_at,
          s.expires_at,
          s.note,
          p.name AS plan_name,
          p.price_monthly,
          p.limits,
          p.is_active AS plan_is_active,
          p.created_at AS plan_created_at,
          p.updated_at AS plan_updated_at
        FROM tenant_subscriptions s
        JOIN subscription_plans p ON p.id = s.plan_id
        ${tenantFilter}
        ORDER BY s.tenant_id, s.starts_at DESC, s.created_at DESC
      )
      SELECT current_subscriptions.*, clock.evaluated_at
      FROM clock
      LEFT JOIN current_subscriptions ON true
      ORDER BY current_subscriptions.tenant_id`);
    return {
      items: rows.flatMap((row) => {
        const record = toRecord(row);
        return record ? [record] : [];
      }),
      // `clock LEFT JOIN current_subscriptions` guarantees one row even when
      // there has never been a subscription.
      evaluatedAt: rows[0]!.evaluated_at,
    };
  }
}
