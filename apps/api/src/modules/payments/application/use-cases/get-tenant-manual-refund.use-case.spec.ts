import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundView } from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { GetTenantManualRefundUseCase } from './get-tenant-manual-refund.use-case';

describe('GetTenantManualRefundUseCase', () => {
  it('returns explicit masked detail fields and hides the private object key', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new GetTenantManualRefundUseCase(
      fakePort<IManualRefundOperationRepository>({ findViewById: () => Promise.resolve(manualRefundView()) }),
      tenantDb.service,
    );
    const result = await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID);
    expect(result.evidence).toEqual({ present: false, contentType: null, sizeBytes: null, verifiedAt: null });
    expect(JSON.stringify(result)).not.toContain('secret-ciphertext');
    expect(JSON.stringify(result)).not.toContain('manual-refund-evidence/');
  });
});
