import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { defaultCommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import {
  FinanceBookingNotFound,
  HeldSettlementMissing,
  SettlementOnsiteAmountMismatch,
} from '../../domain/errors/finance-domain-errors';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import type { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import type { RecordSettlementWithholdingUseCase } from './record-settlement-withholding.use-case';
import { StartSettlementWindowUseCase } from './start-settlement-window.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';
const HELD = 500_000n;
const FINAL = 500_000n;
const SERVICE_DATE = new Date('2026-08-10T02:00:00Z');

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: 'settlement-1',
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    partnerId: PARTNER_ID,
    status: 'held',
    kind: 'service_completed',
    onlineHeldAmount: HELD,
    onsiteCollectedAmount: 0n,
    securityDepositHeld: 0n,
    refundedAmount: 0n,
    retainedAmount: 0n,
    ...overrides,
  }) as unknown as SettlementRecord;

interface Options {
  record?: SettlementRecord | null;
  bookingMissing?: boolean;
  holdingDays?: number;
  opened?: SettlementRecord | null;
  finalAmount?: bigint;
}

function harness(options: Options = {}) {
  const windows: unknown[] = [];
  const withholdings: unknown[] = [];
  const tx = fakeTx({
    booking: {
      findUnique: () =>
        Promise.resolve(
          options.bookingMissing
            ? null
            : {
                id: BOOKING_ID,
                partnerId: PARTNER_ID,
                affiliateId: null,
                totalAmount: options.finalAmount ?? FINAL,
                finalAmount: options.finalAmount ?? FINAL,
                paidAmount: HELD,
                additionalCharges: [],
                commissionSnapshot: defaultCommissionSnapshot(false, SERVICE_DATE),
                promotionSnapshot: null,
                discountAmount: 0n,
              },
        ),
    },
    $queryRaw: () => Promise.resolve([{ serviceDate: SERVICE_DATE }]),
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new StartSettlementWindowUseCase(
      fakePort<ISettlementRepository>({
        ensureHeldForBooking: () =>
          Promise.resolve(options.record === undefined ? settlement() : options.record),
        startDisputeWindow: (_tx, bookingId, onsite, days, amounts) => {
          windows.push({ bookingId, onsite, days, amounts });
          return Promise.resolve(
            (options.opened === undefined
              ? settlement({ status: 'dispute_window' })
              : options.opened) as never,
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
      fakeCollaborator<RecordSettlementWithholdingUseCase>({
        execute: (...args: unknown[]) => {
          withholdings.push(args.slice(1));
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    windows,
    withholdings,
  };
}

describe('StartSettlementWindowUseCase', () => {
  it('refuses when the booking cannot be read', async () => {
    const { useCase } = harness({ bookingMissing: true });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(
      FinanceBookingNotFound,
    );
  });

  it('refuses when no held settlement exists for the booking', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(
      HeldSettlementMissing,
    );
  });

  it('is a no-op once the window is already open', async () => {
    // `booking.completed` is delivered at least once.
    const { useCase, windows } = harness({ record: settlement({ status: 'dispute_window' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(windows).toEqual([]);
  });

  it("opens the window on the tenant's own holding period and assesses tax", async () => {
    // Confirmed completion is what this product treats as accepting the
    // transaction, so it is the tax trigger — and the dispute window governs only
    // when money becomes payable, never whether tax was assessed.
    const { useCase, tenantDb, windows, withholdings } = harness({ holdingDays: 7 });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ bookingId: BOOKING_ID, days: 7 });
    expect(withholdings).toHaveLength(1);
  });

  it('assesses no tax when the guarded window write matched no row', async () => {
    // Two deliveries racing: only the one that actually opened the window may
    // append a tax assessment, or the trail double-counts.
    const { useCase, withholdings } = harness({ opened: null });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(withholdings).toEqual([]);
  });

  it('rejects an on-site amount that disagrees with what is outstanding', async () => {
    // The partner reports what they collected; a mismatch means settlement would
    // be built on a number the booking does not support.
    const { useCase, windows } = harness({ finalAmount: 800_000n });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, 0n)).rejects.toBeInstanceOf(
      SettlementOnsiteAmountMismatch,
    );
    expect(windows).toEqual([]);
  });

  it('defaults the on-site figure to what the booking still owes', async () => {
    const { useCase, windows } = harness({ finalAmount: 800_000n });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(windows[0]).toMatchObject({ onsite: 300_000n });
  });
});
