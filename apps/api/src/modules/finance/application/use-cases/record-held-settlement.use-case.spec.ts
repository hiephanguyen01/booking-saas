import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ISettlementRepository } from '../../domain/ports/settlement-repository.port';
import { RecordHeldSettlementUseCase } from './record-held-settlement.use-case';

const TENANT_ID = 'tenant-1';
const PAYMENT_ID = 'payment-1';

describe('RecordHeldSettlementUseCase', () => {
  it('opens the held-funds record for the payment, in one tenant transaction', async () => {
    // `payment.succeeded` is delivered at least once, so the repository call is
    // the idempotent one (create-or-find); this use case adds only the scoping.
    const calls: Array<{ tenantId: string; paymentId: string }> = [];
    const tenantDb = fakeTenantDb();
    const useCase = new RecordHeldSettlementUseCase(
      fakePort<ISettlementRepository>({
        createHeldFromPayment: (_tx, tenantId, paymentId) => {
          calls.push({ tenantId, paymentId });
          return Promise.resolve(null as never);
        },
      }),
      tenantDb.service,
    );

    await useCase.execute(TENANT_ID, PAYMENT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ tenantId: TENANT_ID, paymentId: PAYMENT_ID }]);
  });
});
