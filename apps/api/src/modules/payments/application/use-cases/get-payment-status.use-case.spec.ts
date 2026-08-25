import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
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

function harness(record: PaymentBookingRecord | null, paymentStatus: string | null = 'pending') {
  const tenantDb = fakeTenantDb();
  const useCase = new GetPaymentStatusUseCase(
    fakePort<IPaymentBookingReader>({ findByCode: () => Promise.resolve(record) }),
    fakePort<IPaymentRepository>({
      findLatestByBooking: () =>
        Promise.resolve(
          paymentStatus === null ? null : ({ status: paymentStatus, kind: 'deposit' } as never),
        ),
    }),
    fakeCollaborator<ResolveTenantByHostUseCase>({
      execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
    }),
    tenantDb.service,
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
});
