import { describe, expect, it } from 'vitest';
import type { BookingSettlementsQuery } from '@booking/contracts';
import { fakePort } from '~testing';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { ListPlatformSettlementsUseCase } from './list-platform-settlements.use-case';

describe('ListPlatformSettlementsUseCase', () => {
  it('reads across tenants, so it opens no tenant transaction', async () => {
    // A platform-wide settlement list wrapped in `forTenant` would be scoped to
    // one tenant and silently return an empty page. The paging and filters are
    // unpacked here because the platform reader takes them positionally.
    const calls: unknown[] = [];
    const page = { items: [] as SettlementRecord[], total: 0 };
    const useCase = new ListPlatformSettlementsUseCase(
      fakePort<ISettlementRepository>({
        listPlatform: (page_, pageSize, filters) => {
          calls.push({ page: page_, pageSize, filters });
          return Promise.resolve(page as never);
        },
      }),
    );

    await expect(
      useCase.execute({
        page: 3,
        pageSize: 25,
        status: 'released',
        partnerId: 'partner-1',
      } as BookingSettlementsQuery),
    ).resolves.toBe(page);
    expect(calls).toEqual([
      { page: 3, pageSize: 25, filters: { status: 'released', partnerId: 'partner-1' } },
    ]);
  });
});
