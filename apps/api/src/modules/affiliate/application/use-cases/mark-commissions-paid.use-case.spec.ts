import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IAffiliateCommissionRepository } from '../../domain/ports/affiliate-commission-repository.port';
import { MarkCommissionsPaidUseCase } from './mark-commissions-paid.use-case';

describe('MarkCommissionsPaidUseCase', () => {
  it('marks THIS affiliate’s confirmed commissions paid, inside its own transaction', async () => {
    // The handler carries no request context, so it opens the tenant scope
    // itself; the set-based update is what keeps only `confirmed` rows moving.
    const marked: string[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new MarkCommissionsPaidUseCase(
      fakePort<IAffiliateCommissionRepository>({
        markConfirmedPaid: (_tx, affiliateId) => {
          marked.push(affiliateId);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    );

    await useCase.execute('tenant-1', 'affiliate-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(marked).toEqual(['affiliate-1']);
  });
});
