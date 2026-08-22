import { describe, expect, it } from 'vitest';
import type { UpdateAffiliatePayoutInfoInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { AffiliateWithUser } from '../../domain/ports/affiliate-reader.port';
import type { IAffiliateRepository } from '../../domain/ports/affiliate-repository.port';
import type { ICommissionRuleReader } from '../../domain/ports/commission-rule-reader.port';
import { UpdateAffiliatePayoutInfoUseCase } from './update-affiliate-payout-info.use-case';

const TENANT_ID = 'tenant-1';
const AFFILIATE_ID = 'affiliate-1';
const RULE = { affiliateRate: 8n, affiliateRateType: 'percent' as const };

function harness(status: string = 'pending') {
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
    useCase: new UpdateAffiliatePayoutInfoUseCase(
      fakePort<IAffiliateRepository>({
        replacePayoutInfo: (_tx, id, intent) => {
          writes.push({ id, intent });
          return Promise.resolve({
            id,
            status,
            customRate: null,
            ...intent,
          } as unknown as AffiliateWithUser);
        },
      }),
      fakePort<ICommissionRuleReader>({
        findTenantDefault: () => Promise.resolve(RULE as never),
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    writes,
    events,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    bank: 'Vietcombank',
    accountNumber: '0071000123456',
    holderName: 'NGUYEN VAN GIANG',
    ...overrides,
  }) as unknown as UpdateAffiliatePayoutInfoInput;

describe('UpdateAffiliatePayoutInfoUseCase', () => {
  it('REPLACES the whole payout object', async () => {
    // A merge would leave a previous bank's account number under a new bank
    // name — money to a stale account.
    const { useCase, writes, tenantDb } = harness();

    await useCase.execute(TENANT_ID, AFFILIATE_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(writes).toEqual([
      {
        id: AFFILIATE_ID,
        intent: {
          payoutInfo: {
            bank: 'Vietcombank',
            accountNumber: '0071000123456',
            holderName: 'NGUYEN VAN GIANG',
          },
        },
      },
    ]);
  });

  it('allows the correction while still PENDING', async () => {
    // Fixing a typo before approval is precisely when it matters, so unlike the
    // rest of the portal this path is not approval-gated.
    const { useCase, writes } = harness('pending');

    await useCase.execute(TENANT_ID, AFFILIATE_ID, input());

    expect(writes).toHaveLength(1);
  });

  it('announces the change in the SAME transaction as the write', async () => {
    // Payout details route money; the audit event must not survive a rolled-back
    // write, nor be lost by one that committed.
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, AFFILIATE_ID, input());

    expect(events).toEqual([
      { eventType: 'affiliate.payout_updated', payload: { affiliateId: AFFILIATE_ID } },
    ]);
  });
});
