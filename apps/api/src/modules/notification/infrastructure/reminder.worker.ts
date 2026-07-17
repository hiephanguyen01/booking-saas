import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { addMinutes, utcNow } from '../../../shared/time/time';
import { DispatchReminderUseCase } from '../application/use-cases/dispatch-reminder.use-case';
import { NOTIFICATION_READER, type INotificationReader } from '../domain/ports/notification-reader.port';

export const REMINDER_QUEUE = 'notification-reminder';
const POLL_EVERY_MS = 5 * 60_000;
/** Remind the customer ~24h before the slot starts (§17 BookingReminder T−24h). */
const REMINDER_LEAD_MINUTES = 24 * 60;
const REMINDER_BAND_MINUTES = 60;

/**
 * DB-polled reminder job (§17), same shape as the booking scheduler. Every tick it
 * finds confirmed bookings whose start falls in the T−24h band and sends the
 * customer a reminder. Sends are idempotent (deduped in notification_logs), so the
 * overlapping polls never resend.
 */
@Injectable()
export class ReminderWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ReminderWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    private readonly dispatchReminder: DispatchReminderUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NOTIFICATION_REMINDER_DISABLED === 'true' || process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(REMINDER_QUEUE, { connection });
    await this.queue.upsertJobScheduler('reminder-poll', { every: POLL_EVERY_MS }, { name: 'poll' });
    this.worker = new Worker(REMINDER_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Find due bookings (admin pool, cross-tenant) and remind each customer. */
  async sweep(): Promise<number> {
    const now = utcNow();
    const from = addMinutes(now, REMINDER_LEAD_MINUTES - REMINDER_BAND_MINUTES);
    const to = addMinutes(now, REMINDER_LEAD_MINUTES);
    const due = await this.reader.findUpcomingConfirmed(from, to);
    let sent = 0;
    for (const { tenantId, bookingId } of due) {
      try {
        await this.dispatchReminder.execute(tenantId, bookingId);
        sent++;
      } catch (err) {
        this.logger.warn(`reminder for booking ${bookingId} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return sent;
  }
}
