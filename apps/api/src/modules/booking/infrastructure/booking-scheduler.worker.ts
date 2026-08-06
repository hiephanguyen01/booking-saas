import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { QUEUE_OPTIONS } from '../../../shared/redis/queue-options';
import type { BookingStatus } from '@booking/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../shared/outbox/outbox.service';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
} from '../domain/ports/booking-repository.port';
import { Booking } from '../domain/entities/booking.entity';
import { AUTO_COMPLETE_GRACE_HOURS } from '../domain/no-show-window';

export const BOOKING_SCHEDULER_QUEUE = 'booking-scheduler';
const POLL_EVERY_MS = 5_000;

interface DueRow {
  id: string;
  tenantId: string;
  status: BookingStatus;
  toStatus: BookingStatus;
  eventType: string;
}

interface AutoCompleteRow {
  id: string;
  tenantId: string;
}

/**
 * Time-driven booking transitions (§8.2), DB-polled like the outbox relay:
 * pending_payment past its deadline → expired; pending_approval past its
 * deadline → rejected; and a confirmed booking still untouched
 * {@link AUTO_COMPLETE_GRACE_HOURS} after its slot ended → completed.
 *
 * That last one is a deadline, not an inference of success. Partner or Tenant
 * still owns the call and keeps the whole grace period to make it; the sweep
 * only stops a booking hanging in `confirmed` forever, because a settlement
 * that never leaves `held` gives the customer no dispute window and leaves the
 * money in custody indefinitely. `inventory` bookings are excluded — they
 * settle through the return flow, which also handles the security deposit.
 *
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
    if (
      process.env.BOOKING_SCHEDULER_DISABLED === 'true' ||
      process.env.OUTBOX_RELAY_DISABLED === 'true'
    )
      return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(BOOKING_SCHEDULER_QUEUE, { connection, ...QUEUE_OPTIONS });
    await this.queue.upsertJobScheduler('booking-poll', { every: POLL_EVERY_MS }, { name: 'poll' });
    this.worker = new Worker(
      BOOKING_SCHEDULER_QUEUE,
      async () => {
        await this.sweep();
        await this.sweepAutoCompletions();
        await this.sweepAutoReturns();
      },
      { connection },
    );
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
          const transition = Booking.rehydrate(booking).transitionTo(row.toStatus, 'system', {
            expiresAt: null,
          });
          await this.bookings.applyTransition(tx, transition);
          await this.outbox.emit(tx, {
            tenantId: row.tenantId,
            eventType: row.eventType,
            payload: { bookingId: row.id },
          });
        });
        processed++;
      } catch (err) {
        // Already transitioned by a concurrent path / racing sweep — skip.
        this.logger.debug(
          `skip booking ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return processed;
  }

  /**
   * Confirmed bookings whose grace period has fully elapsed (admin pool,
   * cross-tenant). The event carries no `onsiteCollectedAmount`: the sweep
   * witnessed no cash handover, so the settlement applies its own
   * `expectedOnsite` default rather than a figure nobody vouched for.
   */
  async sweepAutoCompletions(): Promise<number> {
    const due = await this.prisma.admin.$queryRaw<AutoCompleteRow[]>`
      SELECT id, tenant_id AS "tenantId"
      FROM bookings
      WHERE status = 'confirmed'
        AND booking_mode <> 'inventory'
        AND upper(timeslot) + (${AUTO_COMPLETE_GRACE_HOURS} * interval '1 hour') <= now()
      LIMIT 100`;

    let processed = 0;
    for (const row of due) {
      try {
        await this.tenantDb.forTenant(row.tenantId, async (tx) => {
          const booking = await this.bookings.findById(tx, row.id);
          if (!booking) return;
          const aggregate = Booking.rehydrate(booking);
          aggregate.assertNonInventoryCompletion();
          const transition = aggregate.planAutoCompletion(await this.tenantDb.databaseNow(tx));
          await this.bookings.applyTransition(tx, transition);
          await this.outbox.emit(tx, {
            tenantId: row.tenantId,
            eventType: 'booking.completed',
            payload: { bookingId: row.id, auto: true },
          });
        });
        processed++;
      } catch (err) {
        // Partner completed / marked no-show between the query and the write.
        this.logger.debug(
          `skip auto-complete ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return processed;
  }

  /**
   * The `inventory` half of the same deadline. These bookings cannot take the
   * plain completion path: their security deposit is only released by a
   * `booking.returned` event, so leaving them out would strand the customer's
   * deposit as surely as a missing dispute window strands their claim. The
   * return is recorded with no damage and no late fee — see
   * `FulfillmentState.planAutoReturn`.
   */
  async sweepAutoReturns(): Promise<number> {
    const due = await this.prisma.admin.$queryRaw<AutoCompleteRow[]>`
      SELECT id, tenant_id AS "tenantId"
      FROM bookings
      WHERE status = 'confirmed'
        AND booking_mode = 'inventory'
        AND upper(timeslot) + (${AUTO_COMPLETE_GRACE_HOURS} * interval '1 hour') <= now()
      LIMIT 100`;

    let processed = 0;
    for (const row of due) {
      try {
        await this.tenantDb.forTenant(row.tenantId, async (tx) => {
          const booking = await this.bookings.findById(tx, row.id);
          if (!booking) return;
          const plan = Booking.rehydrate(booking).planAutoReturn(
            await this.tenantDb.databaseNow(tx),
          );
          await this.bookings.patchFulfillment(tx, row.id, plan.patch, {
            expectedStatus: booking.status,
            unsetMarker: 'returnedAt',
          });
          await this.bookings.applyTransition(tx, plan.completion);
          await this.outbox.emit(tx, {
            tenantId: row.tenantId,
            eventType: 'booking.returned',
            payload: {
              bookingId: row.id,
              lateFee: plan.lateFee.toString(),
              depositRefund: plan.depositRefund.toString(),
              depositShortfall: plan.depositShortfall.toString(),
              auto: true,
            },
          });
          await this.outbox.emit(tx, {
            tenantId: row.tenantId,
            eventType: 'booking.completed',
            payload: { bookingId: row.id, auto: true },
          });
        });
        processed++;
      } catch (err) {
        // Partner processed the return between the query and the write.
        this.logger.debug(
          `skip auto-return ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return processed;
  }
}
