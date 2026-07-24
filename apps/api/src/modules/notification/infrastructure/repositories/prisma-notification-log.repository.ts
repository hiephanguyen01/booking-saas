import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { NotificationLogEntry } from '../../domain/entities/notification-delivery.entity';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';

/**
 * `notification_logs` via the BYPASSRLS admin pool (writes carry a possibly-null
 * tenant_id and the RLS policy has no WITH CHECK for app_user). The dedupe key has
 * a real indexed column; it is also retained in payload for historical/read-side
 * compatibility.
 */
@Injectable()
export class PrismaNotificationLogRepository implements INotificationLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async alreadySent(dedupeKey: string): Promise<boolean> {
    const rows = await this.prisma.admin.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n
      FROM notification_logs
      WHERE status = 'sent' AND dedupe_key = ${dedupeKey}`);
    return (rows[0]?.n ?? 0n) > 0n;
  }

  async record(entry: NotificationLogEntry): Promise<void> {
    await this.prisma.admin.notificationLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        channel: entry.channel,
        eventType: entry.eventType,
        dedupeKey: entry.dedupeKey,
        recipient: entry.recipient,
        status: entry.status,
        error: entry.error,
        sentAt: entry.sentAt,
        payload: { ...entry.payload, dedupeKey: entry.dedupeKey } as Prisma.InputJsonValue,
      },
    });
  }
}
