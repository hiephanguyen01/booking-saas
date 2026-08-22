import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import type { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import type { RecordWithholdingReversalUseCase } from './record-withholding-reversal.use-case';
import { FinalizeSettlementRefundUseCase } from './finalize-settlement-refund.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const REFUND_ID = 'refund-1';

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: 'settlement-1',
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    status: 'refund_pending',
    kind: 'service_completed',
    onlineHeldAmount: 500_000n,
    onsiteCollectedAmount: 0n,
    securityDepositHeld: 0n,
    refundedAmount: 0n,
    retainedAmount: 0n,
    refundId: null,
    ...overrides,
  }) as unknown as SettlementRecord;

interface Options {
  record?: SettlementRecord | null;
  updated?: SettlementRecord | null;
  holdingDays?: number;
}

function harness(options: Options = {}) {
  const finalizations: Array<Record<string, unknown>> = [];
  const reversals: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new FinalizeSettlementRefundUseCase(
      fakePort<ISettlementRepository>({
        ensureHeldForBooking: () =>
          Promise.resolve(options.record === undefined ? settlement() : options.record),
        finalizeRefund: (_tx, bookingId, refundId, refundedAmount, days) => {
          finalizations.push({ bookingId, refundId, refundedAmount, days });
          return Promise.resolve(
            (options.updated === undefined
              ? settlement({ status: 'refunded' })
              : options.updated) as never,
          );
        },
      }),
      fakeCollaborator<GetPayoutPolicyUseCase>({
        execute: () =>
          Promise.resolve(
            PayoutPolicy.fromStored({
              payout: { holdingDays: options.holdingDays ?? 3, minAmount: '0', cycle: 'monthly' },
            }),
          ),
      }),
      fakeCollaborator<RecordWithholdingReversalUseCase>({
        execute: (...args: unknown[]) => {
          reversals.push(args.slice(1));
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    finalizations,
    reversals,
  };
}

describe('FinalizeSettlementRefundUseCase', () => {
  it('does nothing when the booking has no settlement', async () => {
    const { useCase, finalizations } = harness({ record: null });

    await useCase.execute(TENANT_ID, BOOKING_ID, REFUND_ID, 500_000n);

    expect(finalizations).toEqual([]);
  });

  it('applies the refund and appends a proportional tax reversal', async () => {
    // A refund never edits or deletes the original assessment: it appends a linked
    // reversal so `assessment − Σ reversals = final position` still holds.
    const { useCase, tenantDb, finalizations, reversals } = harness({ holdingDays: 5 });

    await useCase.execute(TENANT_ID, BOOKING_ID, REFUND_ID, 200_000n);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(finalizations[0]).toMatchObject({
      bookingId: BOOKING_ID,
      refundId: REFUND_ID,
      refundedAmount: 200_000n,
      days: 5,
    });
    expect(reversals).toHaveLength(1);
  });

  it('reverses nothing when the guarded write matched no row', async () => {
    // `refund.completed` is delivered at least once; a second delivery must not
    // append a second reversal for the same money.
    const { useCase, reversals } = harness({ updated: null });

    await useCase.execute(TENANT_ID, BOOKING_ID, REFUND_ID, 200_000n);

    expect(reversals).toEqual([]);
  });

  it('is a no-op once the same refund was already applied', async () => {
    const { useCase, finalizations } = harness({
      record: settlement({ status: 'refunded', refundId: REFUND_ID, refundedAmount: 200_000n }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID, REFUND_ID, 200_000n);

    expect(finalizations).toEqual([]);
  });
});
