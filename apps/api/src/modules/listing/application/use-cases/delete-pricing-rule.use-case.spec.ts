import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { PricingRuleNotFound } from '../../domain/errors/pricing-rule-errors';
import type {
  IPricingRuleRepository,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import { DeletePricingRuleUseCase } from './delete-pricing-rule.use-case';

const TENANT_ID = 'tenant-1';
const RULE_ID = 'rule-1';

function harness(existing: PricingRuleRecord | null) {
  const deleted: string[] = [];
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
    useCase: new DeletePricingRuleUseCase(
      fakePort<IPricingRuleRepository>({
        findById: () => Promise.resolve(existing),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    deleted,
    events,
  };
}

describe('DeletePricingRuleUseCase', () => {
  it('answers not-found for a rule this tenant does not have', async () => {
    const { useCase, deleted } = harness(null);

    await expect(useCase.execute(TENANT_ID, RULE_ID)).rejects.toBeInstanceOf(PricingRuleNotFound);
    expect(deleted).toEqual([]);
  });

  it('deletes the rule and announces it so cached prices are dropped', async () => {
    // Availability caches priced slots; without the event a deleted override keeps
    // being served until the TTL expires.
    const { useCase, tenantDb, deleted, events } = harness({ id: RULE_ID } as PricingRuleRecord);

    await useCase.execute(TENANT_ID, RULE_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([RULE_ID]);
    expect(events).toEqual([
      { eventType: 'pricing_rule.deleted', payload: { pricingRuleId: RULE_ID } },
    ]);
  });
});
