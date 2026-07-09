import { describe, expect, it, vi } from 'vitest';
import type { PrismaTx, TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { ConfirmBookingUseCase } from '../../../booking/application/use-cases/confirm-booking.use-case';
import type { IPaymentRepository, PaymentRef } from '../../domain/ports/payment-repository.port';
import type { PaymentStatus } from '@prisma/client';
import type { WebhookVerification } from '../../domain/ports/payment-gateway.port';
import type { GatewayRegistry } from '../../infrastructure/gateway-registry';
import { HandleWebhookUseCase } from './handle-webhook.use-case';

const TX = {} as PrismaTx;
const RAW = Buffer.from('{}');

function ref(status: PaymentStatus): PaymentRef {
  return { id: 'pay-1', tenantId: 'tenant-1', bookingId: 'booking-1', gateway: 'mock', amount: 300_000n, status, gatewayTxnId: 'mock_txn' };
}

function build(verification: WebhookVerification, snapshot: PaymentRef | null) {
  const payments = {
    findByGatewayTxnId: vi.fn().mockResolvedValue(snapshot),
    markSucceeded: vi.fn().mockResolvedValue(true),
    markTerminalIfPending: vi.fn().mockResolvedValue(false),
  } as unknown as IPaymentRepository;
  const gateway = { verifyWebhook: vi.fn().mockReturnValue(verification) };
  const registry = {
    statelessByKey: vi.fn().mockReturnValue({ peekReference: vi.fn().mockReturnValue('mock_txn') }),
    resolveForTenant: vi.fn().mockResolvedValue(gateway),
  } as unknown as GatewayRegistry;
  const confirmBooking = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as ConfirmBookingUseCase;
  const tenantDb = {
    forTenant: vi.fn((_tenantId: string, fn: (tx: PrismaTx) => Promise<unknown>) => fn(TX)),
  } as unknown as TenantDbService;
  return { useCase: new HandleWebhookUseCase(payments, registry, confirmBooking, tenantDb), payments, confirmBooking };
}

const verify = (event: WebhookVerification['event']): WebhookVerification => ({ valid: true, event, gatewayTxnId: 'mock_txn', amountVnd: 300_000n });

describe('HandleWebhookUseCase terminal guard (§11.2)', () => {
  it('a failed webhook writes via the atomic pending-guard, not markSucceeded', async () => {
    const { useCase, payments } = build(verify('failed'), ref('pending'));
    await useCase.execute('mock', RAW, {});
    expect(payments.markTerminalIfPending).toHaveBeenCalledWith(TX, 'pay-1', 'failed');
    expect(payments.markSucceeded).not.toHaveBeenCalled();
  });

  it('a late failed webhook against an already-succeeded row cannot clobber it', async () => {
    // Snapshot says succeeded (out-of-order delivery). The code must NOT gate on the
    // snapshot — it delegates to the atomic UPDATE ... WHERE status='pending', which
    // no-ops (mock returns false). No unconditional write is issued.
    const { useCase, payments } = build(verify('failed'), ref('succeeded'));
    await useCase.execute('mock', RAW, {});
    expect(payments.markTerminalIfPending).toHaveBeenCalledWith(TX, 'pay-1', 'failed');
    expect(payments.markSucceeded).not.toHaveBeenCalled();
  });

  it('an expired webhook uses the guarded write', async () => {
    const { useCase, payments } = build(verify('expired'), ref('pending'));
    await useCase.execute('mock', RAW, {});
    expect(payments.markTerminalIfPending).toHaveBeenCalledWith(TX, 'pay-1', 'expired');
  });

  it('a succeeded webhook confirms the booking once, after the atomic payment flip', async () => {
    const { useCase, payments, confirmBooking } = build(verify('succeeded'), ref('pending'));
    await useCase.execute('mock', RAW, {});
    expect(payments.markSucceeded).toHaveBeenCalledOnce();
    // Confirm runs outside the payment tx via execute() (owns the slot-taken auto-refund).
    expect(confirmBooking.execute).toHaveBeenCalledWith('tenant-1', 'booking-1');
  });

  it('a duplicate succeeded delivery (flip returns false) does not re-confirm', async () => {
    const { useCase, payments, confirmBooking } = build(verify('succeeded'), ref('succeeded'));
    (payments.markSucceeded as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await useCase.execute('mock', RAW, {});
    expect(confirmBooking.execute).not.toHaveBeenCalled();
  });
});
