import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IBookingRepository,
  TenantBookingFilters,
} from '../../domain/ports/booking-repository.port';
import { ListTenantBookingsUseCase } from './list-tenant-bookings.use-case';

const TENANT_ID = 'tenant-1';

describe('ListTenantBookingsUseCase', () => {
  it('forwards the filters and stays inside one tenant transaction', async () => {
    const seen: TenantBookingFilters[] = [];
    const page = { items: [], total: 0 };
    const tenantDb = fakeTenantDb();
    const useCase = new ListTenantBookingsUseCase(
      fakePort<IBookingRepository>({
        listByTenant: (_tx, filters) => {
          seen.push(filters);
          return Promise.resolve(page as never);
        },
      }),
      tenantDb.service,
    );

    const filters = {
      status: 'confirmed',
      page: 1,
      pageSize: 20,
    } as unknown as TenantBookingFilters;
    await expect(useCase.execute(TENANT_ID, filters)).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(seen).toEqual([filters]);
  });
});
