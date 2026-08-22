import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { PartnerState } from '../../domain/entities/partner.entity';
import { PartnerHasActiveBookings, PartnerNotFound } from '../../domain/errors/partner-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { SuspendPartnerUseCase } from './suspend-partner.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

const state = () =>
  ({
    id: PARTNER_ID,
    tenantId: TENANT_ID,
    status: 'approved',
    isHouse: false,
  }) as unknown as PartnerState;

function harness(options: { found?: PartnerState | null; activeBookings?: number } = {}) {
  const statusWrites: unknown[] = [];
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
    useCase: new SuspendPartnerUseCase(
      fakePort<IPartnerRepository>({
        findStateById: () => Promise.resolve(options.found === undefined ? state() : options.found),
        countActiveBookings: () => Promise.resolve(options.activeBookings ?? 0),
        updateStatus: (_tx, id, intent) => {
          statusWrites.push({ id, intent });
          return Promise.resolve({ id, ...intent } as unknown as PartnerRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    statusWrites,
    events,
  };
}

describe('SuspendPartnerUseCase', () => {
  it('answers not-found for an unknown partner', async () => {
    const { useCase, statusWrites } = harness({ found: null });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID)).rejects.toBeInstanceOf(PartnerNotFound);
    expect(statusWrites).toEqual([]);
  });

  it('REFUSES while the partner still has confirmed bookings ahead', async () => {
    // Suspending would leave customers holding bookings nobody will honour;
    // they have to be resolved first.
    const { useCase, statusWrites, events } = harness({ activeBookings: 2 });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID)).rejects.toBeInstanceOf(
      PartnerHasActiveBookings,
    );
    expect(statusWrites).toEqual([]);
    expect(events).toEqual([]);
  });

  it('refuses on a SINGLE outstanding booking', async () => {
    const { useCase, statusWrites } = harness({ activeBookings: 1 });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID)).rejects.toBeInstanceOf(
      PartnerHasActiveBookings,
    );
    expect(statusWrites).toEqual([]);
  });

  it('suspends a partner with nothing outstanding', async () => {
    const { useCase, statusWrites, events, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(statusWrites).toEqual([{ id: PARTNER_ID, intent: { status: 'suspended' } }]);
    expect(result).toMatchObject({ status: 'suspended' });
    expect(events).toEqual([
      { eventType: 'partner.suspended', payload: { partnerId: PARTNER_ID } },
    ]);
  });
});
