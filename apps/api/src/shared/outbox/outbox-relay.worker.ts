import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { QUEUE_OPTIONS } from '../redis/queue-options';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant-context/tenant-context.service';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { SECRET_PAYLOAD_EVENT_TYPES } from './outbox.types';

export const OUTBOX_QUEUE = 'outbox-relay';
const POLL_EVERY_MS = 2_000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 20;
/** exponential backoff in seconds, capped at 5 minutes */
const backoffSeconds = (attempts: number) => Math.min(2 ** attempts, 300);
/**
 * Written over a `SECRET_PAYLOAD_EVENT_TYPES` payload once it has been
 * delivered. A marker object (rather than bare `{}`) so an operator reading
 * the row can tell "redacted on purpose" apart from an event that always had
 * an empty payload.
 */
const REDACTED_PAYLOAD = { redacted: true } as const;

/**
 * Polls due outbox_events (cross-tenant → admin pool), claims a batch with
 * FOR UPDATE SKIP LOCKED so multiple relay instances never double-process,
 * and dispatches each event to its handlers inside the event's tenant context.
 * Failures reschedule the row with exponential backoff. After MAX_ATTEMPTS the
 * row is parked as a dead letter: it remains queryable for operators but no
 * longer occupies a live claim slot.
 */
@Injectable()
export class OutboxRelayWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxHandlerRegistry,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit() {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(OUTBOX_QUEUE, { connection, ...QUEUE_OPTIONS });
    await this.queue.upsertJobScheduler(
      'outbox-poll',
      { every: POLL_EVERY_MS },
      { name: 'poll' },
    );
    this.worker = new Worker(OUTBOX_QUEUE, () => this.drainDueEvents(), { connection });
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** One poll tick: claim and process every due event, batch by batch. */
  async drainDueEvents(): Promise<number> {
    let processed = 0;
    for (;;) {
      const batch = await this.claimBatch();
      if (batch.length === 0) return processed;
      for (const event of batch) {
        await this.dispatch(event);
        processed++;
      }
    }
  }

  private claimBatch() {
    // claim = push available_at forward so a concurrent poller skips these rows
    return this.prisma.admin.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          id: string;
          tenant_id: string | null;
          event_type: string;
          payload: unknown;
          attempts: number;
          created_at: Date;
        }[]
      >`
        SELECT id, tenant_id, event_type, payload, attempts, created_at
        FROM outbox_events
        WHERE processed_at IS NULL
          AND dead_lettered_at IS NULL
          AND available_at <= now()
        ORDER BY created_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length > 0) {
        // DB clock, not Date.now() — host/DB clock skew must never make a
        // claimed row immediately re-claimable (or a fresh row invisible)
        await tx.$executeRaw`
          UPDATE outbox_events
          SET available_at = now() + interval '60 seconds'
          WHERE id = ANY(${rows.map((r) => r.id)}::uuid[])
        `;
      }
      return rows;
    });
  }

  private async dispatch(row: {
    id: string;
    tenant_id: string | null;
    event_type: string;
    payload: unknown;
    attempts: number;
    created_at: Date;
  }): Promise<void> {
    const event = {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      payload: row.payload,
      attempts: row.attempts,
      createdAt: row.created_at,
    };
    try {
      const handlers = this.registry.handlersFor(event.eventType);
      await this.tenantContext.run({ tenantId: event.tenantId ?? undefined }, async () => {
        for (const handler of handlers) {
          await handler(event);
        }
      });
      // Redact only on this successful branch: a failed delivery must keep
      // its payload so the retry can still build the mail.
      const redact = SECRET_PAYLOAD_EVENT_TYPES.has(event.eventType);
      await this.prisma.admin.outboxEvent.update({
        where: { id: event.id },
        data: {
          processedAt: new Date(),
          ...(redact ? { payload: REDACTED_PAYLOAD } : {}),
        },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      const lastError = error instanceof Error ? error.message : String(error);
      if (attempts >= MAX_ATTEMPTS) {
        this.logger.error(
          `outbox event ${event.id} (${event.eventType}) dead-lettered after ${attempts} attempts`,
        );
        // A dead-lettered row is terminal — nothing will ever claim or retry
        // it again — so a listed event's payload is redacted here too, the
        // same as the success path in the `try` block above. This is the
        // ONLY place besides that success update allowed to redact: the
        // ordinary-retry branch below (attempts < MAX_ATTEMPTS) must keep the
        // real payload, or a transient failure would permanently blank an
        // email that was always going to be retried. Unlisted event types
        // are left alone here too, same as on success — a dead-lettered
        // booking/payout/tax event needs its payload intact for an operator
        // to diagnose why it kept failing.
        const sets = [
          Prisma.sql`attempts = ${attempts}`,
          Prisma.sql`last_error = ${lastError}`,
          Prisma.sql`dead_lettered_at = now()`,
        ];
        if (SECRET_PAYLOAD_EVENT_TYPES.has(event.eventType)) {
          sets.push(Prisma.sql`payload = ${JSON.stringify(REDACTED_PAYLOAD)}::jsonb`);
        }
        await this.prisma.admin.$executeRaw(Prisma.sql`
          UPDATE outbox_events
          SET ${Prisma.join(sets)}
          WHERE id = ${event.id}::uuid
        `);
        return;
      }
      this.logger.warn(`outbox event ${event.id} (${event.eventType}) failed attempt ${attempts}`);
      await this.prisma.admin.$executeRaw`
        UPDATE outbox_events
        SET attempts = ${attempts},
            last_error = ${lastError},
            available_at = now() + make_interval(secs => ${backoffSeconds(attempts)})
        WHERE id = ${event.id}::uuid
      `;
    }
  }
}
