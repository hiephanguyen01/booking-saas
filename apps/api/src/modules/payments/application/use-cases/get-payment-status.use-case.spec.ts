import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type { GatewayRegistryPort } from '../../domain/ports/gateway-registry.port';
import type {
  IPaymentBookingReader,
  PaymentBookingRecord,
} from '../../domain/ports/payment-booking-reader.port';
import type { IPaymentRepository } from '../../domain/ports/payment-repository.port';
import { GetPaymentStatusUseCase } from './get-payment-status.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CODE = 'BK-0001';

const booking = (overrides: Record<string, unknown> = {}): PaymentBookingRecord =>
  ({
    id: 'booking-1',
    code: CODE,
    status: 'pending_payment',
    paidAmount: 0n,
    ...overrides,
  }) as unknown as PaymentBookingRecord;

function harness(
  record: PaymentBookingRecord | null,
  paymentStatus: string | null = 'pending',
  gatewayStatus: string = 'pending',
) {
  const tenantDb = fakeTenantDb();
  const useCase = new GetPaymentStatusUseCase(
    fakePort<IPaymentBookingReader>({ findByCode: () => Promise.resolve(record) }),
    fakePort<IPaymentRepository>({
      findLatestByBooking: () =>
        Promise.resolve(
          paymentStatus === null
            ? null
            : ({
                id: 'payment-1',
                status: paymentStatus,
                kind: 'deposit',
                amount: 500_000n,
                gatewayOrderRef: 'SEPAY_ORDER_123',
              } as never),
        ),
      markSucceeded: () => Promise.resolve(true),
    }),
    fakePort<GatewayRegistryPort>({
      resolveForPayment: () =>
        Promise.resolve({
          gateway: {
            queryPaymentStatus: () =>
              Promise.resolve({
                status: gatewayStatus as never,
                amountVnd: 500_000n,
                gatewayTxnId: 'TXN_999',
              }),
          } as never,
          settings: {} as never,
          configRevisionId: 'rev-1',
        }),
    }),
    fakeCollaborator<ResolveTenantByHostUseCase>({
      execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
    }),
    tenantDb.service,
    fakePort<OutboxService>({ emit: () => Promise.resolve() } as never),
  );
  return { useCase, tenantDb };
}

describe('GetPaymentStatusUseCase', () => {
  it('rejects a booking code that does not exist on this host', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(HOST, CODE)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it('reports the latest payment attempt beside the booking status', async () => {
    // The storefront polls this instead of trusting the gateway's returnUrl.
    const { useCase, tenantDb } = harness(booking({ paidAmount: 500_000n }), 'succeeded');

    await expect(useCase.execute(HOST, CODE)).resolves.toEqual({
      bookingCode: CODE,
      bookingStatus: 'pending_payment',
      paymentStatus: 'succeeded',
      paymentKind: 'deposit',
      paidAmount: '500000',
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it("reports 'none' when the booking has no payment attempt yet", async () => {
    const { useCase } = harness(booking(), null);

    await expect(useCase.execute(HOST, CODE)).resolves.toMatchObject({
      paymentStatus: 'none',
      paymentKind: null,
    });
  });

  it('auto-reconciles pending payment with gateway and returns confirmed status when gateway captured', async () => {
    const { useCase } = harness(booking(), 'pending', 'succeeded');

    const result = await useCase.execute(HOST, CODE);
    expect(result).toMatchObject({
      bookingCode: CODE,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded',
    });
  });
});
