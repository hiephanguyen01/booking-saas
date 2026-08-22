import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { AffiliateState } from '../../domain/entities/affiliate.entity';
import { AffiliateNotFound } from '../../domain/errors/affiliate-errors';
import type { IAffiliateRepository } from '../../domain/ports/affiliate-repository.port';
import { SetAffiliateStatusUseCase } from './set-affiliate-status.use-case';

const TENANT_ID = 'tenant-1';
const AFFILIATE_ID = 'affiliate-1';

const state = (overrides: Partial<AffiliateState> = {}): AffiliateState =>
  ({
    id: AFFILIATE_ID,
    tenantId: TENANT_ID,
    userId: 'user-1',
    status: 'pending',
    customRate: null,
    ...overrides,
  }) as AffiliateState;

function harness(existing: AffiliateState | null = state()) {
  const writes: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new SetAffiliateStatusUseCase(
      fakePort<IAffiliateRepository>({
        loadById: () => Promise.resolve(existing),
        setStatus: (_tx, id, intent) => {
          writes.push({ id, intent });
          return Promise.resolve({ ...state(), id, status: intent.status });
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    writes,
    events,
  };
}

describe('SetAffiliateStatusUseCase', () => {
  it('answers not-found for an unknown affiliate', async () => {
    const { useCase, writes } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID, 'approved'),
    ).rejects.toBeInstanceOf(AffiliateNotFound);
    expect(writes).toEqual([]);
  });

  it('APPROVES and announces it as an approval', async () => {
    // The event type is what the notification handler branches on; one generic
    // event would send a suspended affiliate a welcome mail.
    const { useCase, events, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, AFFILIATE_ID, 'approved');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toMatchObject({ status: 'approved' });
    expect(events).toEqual([
      {
        eventType: 'affiliate.approved',
        payload: { affiliateId: AFFILIATE_ID, userId: 'user-1' },
      },
    ]);
  });

  it('SUSPENDS and announces it as a suspension', async () => {
    const { useCase, events } = harness(state({ status: 'approved' }));

    await useCase.execute(TENANT_ID, AFFILIATE_ID, 'suspended');

    expect(events).toEqual([
      {
        eventType: 'affiliate.suspended',
        payload: { affiliateId: AFFILIATE_ID, userId: 'user-1' },
      },
    ]);
  });

  it('names the affiliate’s USER, which is who gets told', async () => {
    const { useCase, events } = harness(state({ userId: 'user-9' }));

    await useCase.execute(TENANT_ID, AFFILIATE_ID, 'approved');

    expect(events[0]?.payload).toMatchObject({ userId: 'user-9' });
  });
});
