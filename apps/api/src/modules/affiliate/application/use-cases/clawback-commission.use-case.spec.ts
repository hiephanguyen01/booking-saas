import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AffiliateCommissionState } from '../../domain/entities/affiliate-commission.entity';
import type { IAffiliateCommissionRepository } from '../../domain/ports/affiliate-commission-repository.port';
import { ClawbackCommissionUseCase } from './clawback-commission.use-case';

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
  status: 'confirmed',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function harness(existing: AffiliateCommissionState | null = stored()) {
  const updates: Array<{ bookingId: string; patch: unknown }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ClawbackCommissionUseCase(
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

describe('ClawbackCommissionUseCase', () => {
  it('does nothing when the booking never earned a commission', async () => {
    const { useCase, updates } = harness(null);

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(updates).toEqual([]);
  });

  it('CLAWS BACK a commission already paid out', async () => {
    // This is the difference from a reversal: a post-completion refund reaches
    // money the affiliate has already received.
    const { useCase, updates, tenantDb } = harness(stored({ status: 'paid' }));

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(updates).toEqual([{ bookingId: BOOKING_ID, patch: { status: 'clawed_back' } }]);
  });

  it('claws back a confirmed but unpaid commission too', async () => {
    const { useCase, updates } = harness(stored({ status: 'confirmed' }));

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(updates).toEqual([{ bookingId: BOOKING_ID, patch: { status: 'clawed_back' } }]);
  });

  it('does NOT touch a still-pending commission', async () => {
    // Pending means the booking never completed, so a refund there is a
    // reversal, not a clawback.
    const { useCase, updates } = harness(stored({ status: 'pending' }));

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(updates).toEqual([]);
  });

  it('is a no-op on an already terminal row', async () => {
    for (const status of ['reversed', 'clawed_back'] as const) {
      const { useCase, updates } = harness(stored({ status }));

      await useCase.execute(TENANT_ID, BOOKING_ID);

      expect(updates).toEqual([]);
    }
  });
});
