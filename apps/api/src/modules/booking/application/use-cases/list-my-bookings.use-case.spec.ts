import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import { ListMyBookingsUseCase } from './list-my-bookings.use-case';

const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';

describe('ListMyBookingsUseCase', () => {
  it('lists the customer bookings inside one transaction for that tenant', async () => {
    // Scoped twice over: the customer id filters the rows and the GUC keeps the
    // read inside the tenant, so the same person booking on two tenants sees each
    // storefront's bookings only on that storefront.
    const asked: string[] = [];
    const rows = [] as BookingRecord[];
    const tenantDb = fakeTenantDb();
    const useCase = new ListMyBookingsUseCase(
      fakePort<IBookingRepository>({
        listByCustomer: (_tx, customerId) => {
          asked.push(customerId);
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID, CUSTOMER_ID)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked).toEqual([CUSTOMER_ID]);
  });
});
