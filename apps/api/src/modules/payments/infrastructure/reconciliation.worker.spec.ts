import { describe, expect, it, vi } from 'vitest';
import type { PrismaTx, TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import type { ConfirmBookingUseCase } from '../../booking/application/use-cases/confirm-booking.use-case';
import type { IPaymentRepository, PaymentRef } from '../domain/ports/payment-repository.port';
import type { PaymentStatusResult } from '../domain/ports/payment-gateway.port';
import type { GatewayRegistry } from './gateway-registry';
import { ReconciliationWorker } from './reconciliation.worker';

const TX = {} as PrismaTx;

function stalePayment(overrides: Partial<PaymentRef> = {}): PaymentRef {
  return {
    id: 'pay-1',
    tenantId: 'tenant-1',
    bookingId: 'booking-1',
    gateway: 'mock',
    amount: 300_000n,
    status: 'pending',
    gatewayTxnId: 'mock_txn',
    ...overrides,
  };
}

function build(queryResult: PaymentStatusResult, stale: PaymentRef[] = [stalePayment()]) {
  const payments = {
    findStalePending: vi.fn().mockResolvedValue(stale),
    markSucceeded: vi.fn().mockResolvedValue(true),
    markTerminalIfPending: vi.fn().mockResolvedValue(true),
  } as unknown as IPaymentRepository;
  const gateway = { queryPaymentStatus: vi.fn().mockResolvedValue(queryResult) };
  const registry = { resolveForTenant: vi.fn().mockResolvedValue(gateway) } as unknown as GatewayRegistry;
  const confirmBooking = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as ConfirmBookingUseCase;
  const tenantDb = {
    forTenant: vi.fn((_tenantId: string, fn: (tx: PrismaTx) => Promise<unknown>) => fn(TX)),
  } as unknown as TenantDbService;
  const worker = new ReconciliationWorker(payments, registry, confirmBooking, tenantDb);
  return { worker, payments, confirmBooking };
}

describe('ReconciliationWorker amount guard (§11.2)', () => {
  it('does NOT confirm an underpaid succeeded query result', async () => {
    const { worker, payments, confirmBooking } = build({ status: 'succeeded', amountVnd: 299_999n });
    const reconciled = await worker.sweep();
    expect(reconciled).toBe(0);
    expect(payments.markSucceeded).not.toHaveBeenCalled();
    expect(confirmBooking.execute).not.toHaveBeenCalled();
  });

  it('confirms when the paid amount matches the expected amount', async () => {
    const { worker, payments, confirmBooking } = build({ status: 'succeeded', amountVnd: 300_000n });
    const reconciled = await worker.sweep();
    expect(reconciled).toBe(1);
    expect(payments.markSucceeded).toHaveBeenCalledOnce();
    expect(confirmBooking.execute).toHaveBeenCalledOnce();
  });

  it('does not confirm a still-pending gateway status', async () => {
    const { worker, payments } = build({ status: 'pending', amountVnd: 0n });
    expect(await worker.sweep()).toBe(0);
    expect(payments.markSucceeded).not.toHaveBeenCalled();
  });

  it('expires a stale payment via the guarded write, never markSucceeded', async () => {
    const { worker, payments } = build({ status: 'expired', amountVnd: 0n });
    expect(await worker.sweep()).toBe(0);
    expect(payments.markTerminalIfPending).toHaveBeenCalledWith(TX, 'pay-1', 'expired');
    expect(payments.markSucceeded).not.toHaveBeenCalled();
  });
});
