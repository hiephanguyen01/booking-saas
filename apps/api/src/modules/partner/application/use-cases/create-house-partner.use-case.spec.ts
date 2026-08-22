import { describe, expect, it } from 'vitest';
import type { CreateHousePartnerInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { NewPartner } from '../../domain/entities/partner.entity';
import { PartnerSlugTaken } from '../../domain/errors/partner-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { CreateHousePartnerUseCase } from './create-house-partner.use-case';

const TENANT_ID = 'tenant-1';

function harness(slugTaken = false) {
  const created: NewPartner[] = [];
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
    useCase: new CreateHousePartnerUseCase(
      fakePort<IPartnerRepository>({
        findBySlug: () =>
          Promise.resolve(slugTaken ? ({ id: 'partner-2' } as PartnerRecord) : null),
        create: (_tx, data) => {
          created.push(data);
          return Promise.resolve({ id: 'partner-house', ...data } as unknown as PartnerRecord);
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

const input = (overrides: Partial<CreateHousePartnerInput> = {}) =>
  ({ name: 'StudioHub trực tiếp', slug: 'studiohub-house', ...overrides }) as CreateHousePartnerInput;

describe('CreateHousePartnerUseCase', () => {
  it('refuses a slug another partner holds', async () => {
    const { useCase, created } = harness(true);

    await expect(useCase.execute(TENANT_ID, input())).rejects.toBeInstanceOf(PartnerSlugTaken);
    expect(created).toEqual([]);
  });

  it('creates it APPROVED and flagged as house — no application to review', async () => {
    // The tenant is selling its own inventory; there is nobody to approve and
    // no payout or identity to collect, since the platform fee is taken on GMV
    // directly.
    const { useCase, created, tenantDb } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      tenantId: TENANT_ID,
      name: 'StudioHub trực tiếp',
      slug: 'studiohub-house',
      isHouse: true,
      status: 'approved',
      verificationStatus: 'unsubmitted',
      payoutInfo: {},
    });
  });

  it('announces it as a house partner so downstream can skip the payout path', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(events).toEqual([
      { eventType: 'partner.created', payload: { partnerId: 'partner-house', isHouse: true } },
    ]);
  });

  it('defaults an omitted description to null rather than undefined', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(created[0]?.description).toBeNull();
  });
});
