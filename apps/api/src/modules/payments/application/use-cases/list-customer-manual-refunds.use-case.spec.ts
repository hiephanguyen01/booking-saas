import { describe, expect, it } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  MANUAL_REFUND_BOOKING_ID,
  MANUAL_REFUND_TENANT_ID,
  manualRefundView,
} from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { ListCustomerManualRefundsUseCase } from './list-customer-manual-refunds.use-case';

describe('ListCustomerManualRefundsUseCase', () => {
  it('returns only masked operations belonging to the authorized booking', async () => {
    const operations = fakePort<IManualRefundOperationRepository>({
      listViewsForBooking: (_tx, tenantId, bookingId) => {
        expect({ tenantId, bookingId }).toEqual({
          tenantId: MANUAL_REFUND_TENANT_ID,
          bookingId: MANUAL_REFUND_BOOKING_ID,
        });
        return Promise.resolve([manualRefundView()]);
      },
    });
    const tenantDb = fakeTenantDb();
    const useCase = new ListCustomerManualRefundsUseCase(operations, tenantDb.service);

    const result = await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_BOOKING_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ bookingId: MANUAL_REFUND_BOOKING_ID });
    expect(JSON.stringify(result)).not.toContain('secret-ciphertext');
    expect(JSON.stringify(result)).not.toContain('manual-refund-evidence/');
  });
});
