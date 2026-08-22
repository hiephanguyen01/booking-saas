import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AffiliateCommissionState } from '../../domain/entities/affiliate-commission.entity';
import type { IAffiliateCommissionRepository } from '../../domain/ports/affiliate-commission-repository.port';
import { ReverseCommissionUseCase } from './reverse-commission.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

const stored = (
  overrides: Partial<AffiliateCommissionState> = {},
): AffiliateCommissionState => ({
  id: 'commission-1',
  tenantId: TENANT_ID,
  affiliateId: 'affiliate-1',
  bookingId: BOOKING_ID,
  amount: 100_000n,
  status: 'pending',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function harness(existing: AffiliateCommissionState | null = stored()) {
  const updates: Array<{ bookingId: string; patch: unknown }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ReverseCommissionUseCase(
      fakePort<IAffiliateCommissionRepository>({
        loadByBooking: () => Promise.resolve(existing),
        updateForBooking: (_tx, bookingId, patch) => {
          updates.push({ bookingId, patch });
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    updates,
  };
}

describe('ReverseCommissionUseCase', () => {
  it('does nothing when the booking never earned a commission', async () => {
    const { useCase, updates } = harness(null);

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(updates).toEqual([]);
  });

  it('reverses a pending or a confirmed commission', async () => {
    for (const status of ['pending', 'confirmed'] as const) {
      const { useCase, updates, tenantDb } = harness(stored({ status }));

      await useCase.execute(TENANT_ID, BOOKING_ID);

      expect(tenantDb.openedFor).toEqual([TENANT_ID]);
      expect(updates).toEqual([{ bookingId: BOOKING_ID, patch: { status: 'reversed' } }]);
    }
  });

  it('REFUSES to reverse money already paid out', async () => {
    // Taking back a paid commission is a clawback, which is a different event
    // with a different accounting treatment.
    const { useCase, updates } = harness(stored({ status: 'paid' }));

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(updates).toEqual([]);
  });

  it('is a no-op on an already terminal row', async () => {
    // At-least-once delivery: a redelivered cancellation must not wedge on a
    // row that has already been dealt with.
    for (const status of ['reversed', 'clawed_back'] as const) {
      const { useCase, updates } = harness(stored({ status }));

      await useCase.execute(TENANT_ID, BOOKING_ID);

      expect(updates).toEqual([]);
    }
  });
});
