import { describe, expect, it } from 'vitest';
import type { AdminSettlementDisputesQuery } from '@booking/contracts';
import { fakePort } from '~testing';
import type { ISettlementDisputeRepository } from '../../domain/ports/settlement-dispute-repository.port';
import { ListPlatformDisputesUseCase } from './list-platform-disputes.use-case';

function harness() {
  const calls: Array<{ page: number; pageSize: number; filters: Record<string, unknown> }> = [];
  const page = { items: [], total: 0 };
  return {
    useCase: new ListPlatformDisputesUseCase(
      fakePort<ISettlementDisputeRepository>({
        listPlatform: (pageNo, pageSize, filters) => {
          calls.push({ page: pageNo, pageSize, filters: filters as Record<string, unknown> });
          return Promise.resolve(page as never);
        },
      }),
    ),
    calls,
    page,
  };
}

describe('ListPlatformDisputesUseCase', () => {
  it('parses the ISO window and keeps the tenant filter optional', async () => {
    // Cross-tenant admin view: `tenantId` is a FILTER here, not a scope, which is
    // why there is no `forTenant`.
    const { useCase, calls } = harness();

    await useCase.execute({
      page: 1,
      pageSize: 20,
      tenantId: 'tenant-2',
      status: 'open',
      responseStatus: 'responded',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
      q: 'BK-00',
    } as AdminSettlementDisputesQuery);

    expect(calls[0]?.filters).toEqual({
      tenantId: 'tenant-2',
      status: 'open',
      responseStatus: 'responded',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      q: 'BK-00',
    });
  });

  it('leaves the window open when no dates are given', async () => {
    const { useCase, calls } = harness();

    await useCase.execute({ page: 1, pageSize: 20 } as AdminSettlementDisputesQuery);

    expect(calls[0]?.filters).toMatchObject({ from: undefined, to: undefined });
  });
});
