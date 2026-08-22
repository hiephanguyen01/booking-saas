import { describe, expect, it } from 'vitest';
import type { UpdatePayoutInfoInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import type { IPartnerReader } from '../../domain/ports/partner-reader.port';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { UpdatePayoutInfoUseCase } from './update-payout-info.use-case';

const PARTNER_ID = 'partner-1';

function harness(tenantId: string | null = 'tenant-9') {
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
    useCase: new UpdatePayoutInfoUseCase(
      fakePort<IPartnerReader>({ tenantIdOfPartner: () => Promise.resolve(tenantId) }),
      fakePort<IPartnerRepository>({
        updatePayoutInfo: (_tx, id, intent) => {
          writes.push(intent);
          return Promise.resolve({ id, ...intent } as unknown as PartnerRecord);
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

const input = (overrides: Partial<UpdatePayoutInfoInput> = {}) =>
  ({
    bank: 'Vietcombank',
    accountNumber: '0071000123456',
    holderName: 'NGUYEN VAN GIANG',
    ...overrides,
  }) as UpdatePayoutInfoInput;

describe('UpdatePayoutInfoUseCase', () => {
  it('answers not-found when the partner belongs to no tenant', async () => {
    const { useCase, writes } = harness(null);

    await expect(useCase.execute(PARTNER_ID, input())).rejects.toBeInstanceOf(PartnerNotFound);
    expect(writes).toEqual([]);
  });

  it('REPLACES the payout block rather than merging into it', async () => {
    // A merge would leave a previous bank's account number behind under a new
    // bank name — money would go to a stale account.
    const { useCase, writes, tenantDb } = harness();

    await useCase.execute(PARTNER_ID, input());

    // The route is partner-scoped, so the tenant comes from the partner itself.
    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(writes).toEqual([
      {
        payoutInfo: {
          bank: 'Vietcombank',
          accountNumber: '0071000123456',
          holderName: 'NGUYEN VAN GIANG',
        },
      },
    ]);
  });

  it('keeps the holder name, which identity verification matches against', async () => {
    const { useCase, writes } = harness();

    await useCase.execute(PARTNER_ID, input({ holderName: 'Nguyễn Văn Giang' }));

    expect(writes[0]).toMatchObject({
      payoutInfo: expect.objectContaining({ holderName: 'Nguyễn Văn Giang' }),
    });
  });

  it('announces the change', async () => {
    const { useCase, events } = harness();

    await useCase.execute(PARTNER_ID, input());

    expect(events).toEqual([
      { eventType: 'partner.payout_updated', payload: { partnerId: PARTNER_ID } },
    ]);
  });
});
