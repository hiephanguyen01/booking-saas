import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { DepositBelowTenantCommission } from '../../domain/errors/listing-errors';
import type { ICommissionCoverageReader } from '../../domain/ports/commission-coverage-reader.port';
import { AssertListingDepositCoverageUseCase } from './assert-listing-deposit-coverage.use-case';

const target = {
  partnerId: 'partner-1',
  listingTypeId: 'type-1',
  categoryId: null,
};

function harness(rule: unknown) {
  const reads: string[] = [];
  return {
    useCase: new AssertListingDepositCoverageUseCase(
      fakePort<ICommissionCoverageReader>({
        findEffectiveRule: () => {
          reads.push('findEffectiveRule');
          return Promise.resolve(rule as never);
        },
      }),
    ),
    tx: fakeTenantDb().tx,
    reads,
  };
}

describe('AssertListingDepositCoverageUseCase', () => {
  it('accepts a deposit that covers the tenant commission', async () => {
    const { useCase, tx } = harness({ id: 'rule-1', rateType: 'percent', rate: 15n });

    await expect(useCase.execute(tx, { ...target, isHouse: false }, 20)).resolves.toBeUndefined();
  });

  it('treats the boundary as covered', async () => {
    const { useCase, tx } = harness({ id: 'rule-1', rateType: 'percent', rate: 15n });

    await expect(useCase.execute(tx, { ...target, isHouse: false }, 15)).resolves.toBeUndefined();
  });

  it('rejects a deposit below the tenant commission', async () => {
    const { useCase, tx } = harness({ id: 'rule-1', rateType: 'percent', rate: 15n });

    await expect(useCase.execute(tx, { ...target, isHouse: false }, 10)).rejects.toBeInstanceOf(
      DepositBelowTenantCommission,
    );
  });

  it('waives the guard for house inventory WITHOUT reading a rule', async () => {
    // The tenant is selling its own stock, so there is no outside partner whose
    // share could go negative — and no reason to spend the query.
    const { useCase, tx, reads } = harness({ id: 'rule-1', rateType: 'percent', rate: 90n });

    await expect(useCase.execute(tx, { ...target, isHouse: true }, 0)).resolves.toBeUndefined();
    expect(reads).toEqual([]);
  });

  it('imposes nothing when the commission is fixed rather than a percentage', async () => {
    const { useCase, tx } = harness({ id: 'rule-1', rateType: 'fixed', rate: 500_000n });

    await expect(useCase.execute(tx, { ...target, isHouse: false }, 0)).resolves.toBeUndefined();
  });
});
