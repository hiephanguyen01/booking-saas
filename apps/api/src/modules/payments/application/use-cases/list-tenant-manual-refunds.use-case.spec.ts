import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_TENANT_ID, manualRefundView } from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { ListTenantManualRefundsUseCase } from './list-tenant-manual-refunds.use-case';

describe('ListTenantManualRefundsUseCase', () => {
  it('returns a tenant-scoped masked batch queue without persistence secrets', async () => {
    const tenantDb = fakeTenantDb({ now: new Date('2026-09-04T13:00:00Z') });
    const useCase = new ListTenantManualRefundsUseCase(
      fakePort<IManualRefundOperationRepository>({
        listViews: (_tx, tenantId, query, overdueBefore) => {
          expect({ tenantId, query, overdueBefore }).toEqual({
            tenantId: MANUAL_REFUND_TENANT_ID,
            query: { page: 1, pageSize: 20, overdue: true },
            overdueBefore: new Date('2026-09-04T13:00:00Z'),
          });
          return Promise.resolve({ items: [manualRefundView()], total: 1 });
        },
      }),
      tenantDb.service,
    );
    const result = await useCase.execute(MANUAL_REFUND_TENANT_ID, {
      page: 1,
      pageSize: 20,
      overdue: true,
    });
    expect(tenantDb.openedFor).toEqual([MANUAL_REFUND_TENANT_ID]);
    expect(result.items[0]).toMatchObject({ bookingCode: 'BK-0001', amount: '1250000' });
    expect(JSON.stringify(result)).not.toContain('secret-ciphertext');
    expect(JSON.stringify(result)).not.toContain('manual-refund-evidence/');
  });
});
