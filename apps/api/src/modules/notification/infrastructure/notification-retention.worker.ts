import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { QUEUE_OPTIONS } from '../../../shared/redis/queue-options';
import { utcNow } from '../../../shared/time/time';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../domain/ports/notification-inbox-repository.port';

export const NOTIFICATION_RETENTION_QUEUE = 'notification-retention';
const POLL_EVERY_MS = 24 * 60 * 60_000;
const RETENTION_DAYS = 90;

/**
 * Prunes inbox rows older than 90 days, read or not. Fan-out at write has no
 * natural ceiling — a tenant with 30 staff turns one `listing.submitted` into
 * 30 rows — so without this sweep the table grows forever.
 *
 * Gates on `OUTBOX_RELAY_DISABLED` only, like every other non-reminder
 * background worker — NOT `NOTIFICATION_REMINDER_DISABLED` (that flag is
 * `reminder.worker.ts`'s booking-reminder-email switch; reusing it here would
 * let an operator silencing reminder emails silently stop this prune too,
 * with no alarm as the table grows unbounded).
 */
@Injectable()
export class NotificationRetentionWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationRetentionWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(NOTIFICATION_RETENTION_QUEUE, { connection, ...QUEUE_OPTIONS });
    await this.queue.upsertJobScheduler(
      'notification-retention-sweep',
      { every: POLL_EVERY_MS },
      { name: 'sweep' },
    );
    this.worker = new Worker(NOTIFICATION_RETENTION_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Cross-tenant sweep on the admin pool (see `deleteOlderThan`) — no tenant to scope to. */
  private async sweep(): Promise<void> {
    const cutoff = new Date(utcNow().getTime() - RETENTION_DAYS * 24 * 60 * 60_000);
    const deleted = await this.inbox.deleteOlderThan(cutoff);
    if (deleted > 0) {
      this.logger.log(`pruned ${deleted} notifications older than ${RETENTION_DAYS}d`);
    }
  }
}
