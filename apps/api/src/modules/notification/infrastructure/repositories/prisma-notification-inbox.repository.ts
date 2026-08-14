import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { InboxRow, NotificationArea } from '../../domain/notification-area';
import type {
  INotificationInboxRepository,
  InboxFeedQuery,
  InboxRowRecord,
} from '../../domain/ports/notification-inbox-repository.port';

interface Row {
  id: string;
  area: NotificationArea;
  event_type: string;
  title: string;
  body: string | null;
  target_type: string;
  target_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

/**
 * ⚠️ RLS on `notifications` isolates TENANTS, not users — see the port's
 * docblock. Every statement below carries `user_id = ${userId}` for exactly
 * that reason. Do not "simplify" one away.
 */
@Injectable()
export class PrismaNotificationInboxRepository implements INotificationInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: PrismaTx, rows: InboxRow[]): Promise<void> {
    if (rows.length === 0) return;
    // ON CONFLICT DO NOTHING makes an at-least-once outbox redelivery a no-op
    // without a read-before-write. Prisma's createMany cannot express the
    // conflict target, so this is raw SQL.
    const values = rows.map(
      (r) => Prisma.sql`(
        gen_random_uuid(), ${r.tenantId}::uuid, ${r.userId}::uuid, ${r.area}::notification_area,
        ${r.eventType}, ${r.title}, ${r.body}, ${r.targetType}, ${r.targetId}::uuid, ${r.dedupeKey}
      )`,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO notifications
        (id, tenant_id, user_id, area, event_type, title, body, target_type, target_id, dedupe_key)
      VALUES ${Prisma.join(values, ', ')}
      ON CONFLICT (user_id, dedupe_key) DO NOTHING`);
  }

  async list(tx: PrismaTx, query: InboxFeedQuery): Promise<RepoPage<InboxRowRecord>> {
    const { userId, area, page, pageSize } = query;
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT id, area, event_type, title, body, target_type, target_id, read_at, created_at
      FROM notifications
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
    const totals = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n FROM notifications
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area`);
    return {
      items: rows.map((r) => ({
        id: r.id,
        area: r.area,
        eventType: r.event_type,
        title: r.title,
        body: r.body,
        targetType: r.target_type,
        targetId: r.target_id,
        readAt: r.read_at,
        createdAt: r.created_at,
      })),
      total: Number(totals[0]?.n ?? 0n),
    };
  }

  async countUnread(tx: PrismaTx, userId: string, area: NotificationArea): Promise<number> {
    const rows = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n FROM notifications
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area
        AND read_at IS NULL`);
    return Number(rows[0]?.n ?? 0n);
  }

  async markRead(tx: PrismaTx, userId: string, id: string, now: Date): Promise<boolean> {
    // Ownership is an UPDATE predicate, never a read-then-check: a read-then-check
    // would let one operator mark a tenant-mate's notification read.
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE notifications SET read_at = ${now}
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND read_at IS NULL`);
    if (affected > 0) return true;
    // Already-read is success (idempotent), missing/foreign is not.
    const rows = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n FROM notifications
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`);
    return (rows[0]?.n ?? 0n) > 0n;
  }

  async markAllRead(
    tx: PrismaTx, userId: string, area: NotificationArea, now: Date,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE notifications SET read_at = ${now}
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area
        AND read_at IS NULL`);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    // Cross-tenant sweep on the admin pool — there is no single tenant to scope to.
    return this.prisma.admin.$executeRaw(Prisma.sql`
      DELETE FROM notifications WHERE created_at < ${cutoff}`);
  }
}
