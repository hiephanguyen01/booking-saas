import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import { GetBookingByCodeUseCase } from './get-booking-by-code.use-case';

const TENANT_ID = 'tenant-1';
const CODE = 'BK-0001';

function harness(record: BookingRecord | null) {
  const codes: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetBookingByCodeUseCase(
      fakePort<IBookingRepository>({
        findByCode: (_tx, code) => {
          codes.push(code);
          return Promise.resolve(record);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    codes,
  };
}

describe('GetBookingByCodeUseCase', () => {
  it('reads the code inside the tenant transaction', async () => {
    const record = { id: 'booking-1' } as unknown as BookingRecord;
    const { useCase, tenantDb, codes } = harness(record);

    await expect(useCase.execute(TENANT_ID, CODE)).resolves.toBe(record);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(codes).toEqual([CODE]);
  });

  it('answers 404 for a code this tenant does not have', async () => {
    // The tenant scope is what makes a guessed code from another storefront a 404
    // rather than a read.
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, CODE)).rejects.toBeInstanceOf(BookingNotFound);
  });
});
