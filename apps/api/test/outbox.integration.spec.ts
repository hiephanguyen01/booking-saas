import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forTenant, startTestDb, type TestDb } from './helpers/test-db';
import { OutboxHandlerRegistry } from '../src/shared/outbox/outbox-handler.registry';
import { OutboxRelayWorker } from '../src/shared/outbox/outbox-relay.worker';
import { TenantContextService } from '../src/shared/tenant-context/tenant-context.service';
import type { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * Outbox guarantees (TONG-QUAN.md §4.3): the event commits with the business
 * transaction, and a failing handler retries with backoff — no event loss.
 * The relay's drain loop is exercised directly (BullMQ only schedules it).
 */
describe('outbox relay', () => {
  let db: TestDb;
  let tenantId: string;
  let registry: OutboxHandlerRegistry;
  let worker: OutboxRelayWorker;

  beforeAll(async () => {
    db = await startTestDb();
    const tenant = await db.admin.tenant.create({ data: { name: 'T', slug: 't-outbox' } });
    tenantId = tenant.id;
    registry = new OutboxHandlerRegistry();
    worker = new OutboxRelayWorker(
      { admin: db.admin } as PrismaService,
      registry,
      new TenantContextService(),
    );
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
  });

  it('an event rolls back together with its business transaction', async () => {
    await expect(
      forTenant(db.app, tenantId, async (tx) => {
        await tx.outboxEvent.create({
          data: { tenantId, eventType: 'test.rollback', payload: {} },
        });
        throw new Error('business failure');
      }),
    ).rejects.toThrow('business failure');
    const count = await db.admin.outboxEvent.count({ where: { eventType: 'test.rollback' } });
    expect(count).toBe(0);
  });

  it('delivers committed events to the handler inside tenant context', async () => {
    const seen: Array<{ eventType: string; tenantId: string | null }> = [];
    registry.register('test.delivered', async (event) => {
      seen.push({ eventType: event.eventType, tenantId: event.tenantId });
    });
    await forTenant(db.app, tenantId, async (tx) => {
      await tx.outboxEvent.create({
        data: { tenantId, eventType: 'test.delivered', payload: { hello: 'world' } },
      });
    });

    await worker.drainDueEvents();

    expect(seen).toEqual([{ eventType: 'test.delivered', tenantId }]);
    const row = await db.admin.outboxEvent.findFirstOrThrow({
      where: { eventType: 'test.delivered' },
    });
    expect(row.processedAt).not.toBeNull();
  });

  it('a failing handler does not lose the event — it retries and then succeeds', async () => {
    let calls = 0;
    registry.register('test.flaky', async () => {
      calls++;
      if (calls === 1) throw new Error('transient failure');
    });
    await db.admin.outboxEvent.create({
      data: { tenantId, eventType: 'test.flaky', payload: {} },
    });

    await worker.drainDueEvents();
    let row = await db.admin.outboxEvent.findFirstOrThrow({ where: { eventType: 'test.flaky' } });
    expect(row.processedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('transient failure');

    // make the retry due now (on the DB clock), then drain again → succeeds
    await db.admin.$executeRaw`
      UPDATE outbox_events SET available_at = now() - interval '1 second'
      WHERE id = ${row.id}::uuid
    `;
    await worker.drainDueEvents();
    row = await db.admin.outboxEvent.findFirstOrThrow({ where: { eventType: 'test.flaky' } });
    expect(row.processedAt).not.toBeNull();
    expect(calls).toBe(2);
  });
});
