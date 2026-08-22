import { describe, expect, it } from 'vitest';
import type { BookingSettlementsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { ISettlementRepository } from '../../domain/ports/settlement-repository.port';
import { ListBookingSettlementsUseCase } from './list-booking-settlements.use-case';

const TENANT_ID = 'tenant-1';

describe('ListBookingSettlementsUseCase', () => {
  it('pages the tenant register with its filters, inside one transaction', async () => {
    const calls: unknown[] = [];
    const page = { items: [], total: 0 };
    const tenantDb = fakeTenantDb();
    const useCase = new ListBookingSettlementsUseCase(
      fakePort<ISettlementRepository>({
        list: (_tx, pageNo, pageSize, filters) => {
          calls.push({ page: pageNo, pageSize, filters });
          return Promise.resolve(page as never);
        },
      }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(TENANT_ID, {
        page: 2,
        pageSize: 25,
        status: 'dispute_window',
        partnerId: 'partner-1',
      } as BookingSettlementsQuery),
    ).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([
      { page: 2, pageSize: 25, filters: { status: 'dispute_window', partnerId: 'partner-1' } },
    ]);
  });
});
