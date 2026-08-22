import { describe, expect, it } from 'vitest';
import type { CreateResourceInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type {
  IResourceRepository,
  ResourceRecord,
} from '../../domain/ports/resource-repository.port';
import { CreateResourceUseCase } from './create-resource.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

function harness(tenantTimezone: string | null = 'Asia/Bangkok') {
  const created: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
    tenant: {
      findUnique: () =>
        Promise.resolve(tenantTimezone === null ? null : { defaultTimezone: tenantTimezone }),
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new CreateResourceUseCase(
      fakePort<IResourceRepository>({
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve({ id: 'resource-1', ...data } as unknown as ResourceRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    created,
    events,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({ partnerId: PARTNER_ID, name: 'Court 1', ...overrides }) as CreateResourceInput;

describe('CreateResourceUseCase', () => {
  it('honours an explicitly chosen timezone', async () => {
    const { useCase, tenantDb, created, events } = harness();

    await useCase.execute(TENANT_ID, input({ timezone: 'Asia/Ho_Chi_Minh' }));

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      partnerId: PARTNER_ID,
      name: 'Court 1',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(events).toEqual([
      { eventType: 'resource.created', payload: { resourceId: 'resource-1' } },
    ]);
  });

  it("inherits the tenant's configured timezone when none is given", async () => {
    // A resource holds the calendar, and every slot boundary is computed in its
    // timezone — inheriting the wrong one shifts the whole opening schedule.
    const { useCase, created } = harness('Asia/Bangkok');

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({ timezone: 'Asia/Bangkok' });
  });

  it('falls back to the platform default when the tenant row is missing', async () => {
    const { useCase, created } = harness(null);

    await useCase.execute(TENANT_ID, input());

    expect(created[0]).toMatchObject({ timezone: 'Asia/Ho_Chi_Minh' });
  });
});
