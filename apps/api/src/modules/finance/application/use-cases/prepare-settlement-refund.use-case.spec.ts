import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import type { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import { PrepareSettlementRefundUseCase } from './prepare-settlement-refund.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: 'settlement-1',
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    partnerId: 'partner-1',
    status: 'held',
    kind: 'service_completed',
    onlineHeldAmount: 500_000n,
    onsiteCollectedAmount: 0n,
    securityDepositHeld: 0n,
    refundedAmount: 0n,
    retainedAmount: 0n,
    ...overrides,
  }) as unknown as SettlementRecord;

function harness(record: SettlementRecord | null, holdingDays = 3) {
  const calls: Array<{ kind: string; args: unknown }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new PrepareSettlementRefundUseCase(
      fakePort<ISettlementRepository>({
        ensureHeldForBooking: () => Promise.resolve(record),
        prepareRefund: (_tx, bookingId, refundedAmount, kind) => {
          calls.push({ kind: 'prepareRefund', args: { bookingId, refundedAmount, kind } });
          return Promise.resolve(null as never);
        },
        startDisputeWindow: (_tx, bookingId, onsite, days, amounts, kind) => {
          calls.push({
            kind: 'startDisputeWindow',
            args: { bookingId, onsite, days, amounts, kind },
          });
          return Promise.resolve(null as never);
        },
      }),
      fakeCollaborator<GetPayoutPolicyUseCase>({
        execute: () =>
          Promise.resolve(
            PayoutPolicy.fromStored({ payout: { holdingDays, minAmount: '0', cycle: 'monthly' } }),
          ),
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
  };
}

describe('PrepareSettlementRefundUseCase', () => {
  it('does nothing when the booking has no settlement to freeze', async () => {
    const { useCase, calls } = harness(null);

    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);

    expect(calls).toEqual([]);
  });

  it('freezes a partial refund without opening a dispute window', async () => {
    // Money is still moving; the window only starts once the refund is settled.
    const { useCase, tenantDb, calls } = harness(settlement());

    await useCase.execute(TENANT_ID, BOOKING_ID, 200_000n);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('prepareRefund');
  });

  it('adds an incremental refund to what was already refunded', async () => {
    const { useCase, calls } = harness(settlement({ refundedAmount: 100_000n }));

    await useCase.execute(TENANT_ID, BOOKING_ID, 50_000n, undefined, true);

    expect(calls[0]?.args).toMatchObject({ refundedAmount: 150_000n });
  });

  it("opens the window on the tenant's own holding period when the deposit covers the refund", async () => {
    // A cancellation fee refunds the security deposit and RETAINS the online-held
    // amount. Nothing is left moving, so the settlement goes straight into its
    // dispute window rather than staying frozen — on the tenant's configured
    // holding days, not a constant.
    const { useCase, calls } = harness(
      settlement({ securityDepositHeld: 200_000n, onlineHeldAmount: 500_000n }),
      7,
    );

    await useCase.execute(TENANT_ID, BOOKING_ID, 200_000n, 'cancellation_fee');

    expect(calls).toEqual([
      {
        kind: 'startDisputeWindow',
        args: {
          bookingId: BOOKING_ID,
          onsite: 0n,
          days: 7,
          amounts: expect.objectContaining({
            tenantCommissionGross: 500_000n,
            tenantNetEarning: 500_000n,
            partnerPayable: 0n,
          }),
          kind: 'cancellation_fee',
        },
      },
    ]);
  });

  it('keeps freezing while part of the refund is still service money', async () => {
    // The same cancellation-fee path with a refund larger than the deposit still
    // has money moving, so it must not open the window yet.
    const { useCase, calls } = harness(settlement({ securityDepositHeld: 200_000n }));

    await useCase.execute(TENANT_ID, BOOKING_ID, 300_000n, 'cancellation_fee');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'prepareRefund', args: { refundedAmount: 100_000n } });
  });
});
