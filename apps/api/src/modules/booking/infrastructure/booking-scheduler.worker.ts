import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { BookingStatus } from '@booking/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type IBookingRepository } from '../domain/ports/booking-repository.port';
import { assertTransition } from '../domain/booking-state-machine';

export const BOOKING_SCHEDULER_QUEUE = 'booking-scheduler';
const POLL_EVERY_MS = 5_000;

interface DueRow {
  id: string;
  tenantId: string;
  status: BookingStatus;
  toStatus: BookingStatus;
  eventType: string;
}

/**
 * Time-driven booking transitions (§8.2), DB-polled like the outbox relay:
 * pending_payment past its deadline → expired; pending_approval past its
 * deadline → rejected. Service completion is never inferred by a clock: Partner
 * or Tenant must explicitly confirm delivery and the amount collected on site.
 * Idempotent — the repository's `WHERE status = from` guard makes
 * double-processing a no-op.
 */
@Injectable()
export class BookingSchedulerWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BookingSchedulerWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.BOOKING_SCHEDULER_DISABLED === 'true' || process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(BOOKING_SCHEDULER_QUEUE, { connection });
    await this.queue.upsertJobScheduler('booking-poll', { every: POLL_EVERY_MS }, { name: 'poll' });
    this.worker = new Worker(BOOKING_SCHEDULER_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Find due bookings (admin pool, cross-tenant) and transition each. */
  async sweep(): Promise<number> {
    const due = await this.prisma.admin.$queryRaw<DueRow[]>`
      SELECT id, tenant_id AS "tenantId", status::text AS "status",
             (CASE WHEN status = 'pending_payment' THEN 'expired' ELSE 'rejected' END)::text AS "toStatus",
             (CASE WHEN status = 'pending_payment' THEN 'booking.expired' ELSE 'booking.rejected' END) AS "eventType"
      FROM bookings b
      WHERE (status = 'pending_approval' AND expires_at <= now())
         OR (status = 'pending_payment' AND expires_at <= now()
             -- never expire a booking a webhook already paid (avoids paid-but-expired)
             AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'succeeded'))
      LIMIT 100`;

    let processed = 0;
    for (const row of due) {
      try {
        await this.tenantDb.forTenant(row.tenantId, async (tx) => {
          const booking = await this.bookings.findById(tx, row.id);
          if (!booking) return;
          assertTransition(booking.status, row.toStatus, 'system');
          await this.bookings.applyTransition(tx, {
            id: row.id,
            from: booking.status,
            to: row.toStatus,
            actor: 'system',
            expiresAt: null,
          });
          await this.outbox.emit(tx, { tenantId: row.tenantId, eventType: row.eventType, payload: { bookingId: row.id } });
        });
        processed++;
      } catch (err) {
        // Already transitioned by a concurrent path / racing sweep — skip.
        this.logger.debug(`skip booking ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return processed;
  }
}
