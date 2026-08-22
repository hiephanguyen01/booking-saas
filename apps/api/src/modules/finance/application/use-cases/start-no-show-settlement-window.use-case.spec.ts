import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { defaultCommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import {
  FinanceBookingNotFound,
  HeldSettlementMissing,
} from '../../domain/errors/finance-domain-errors';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { PayoutPolicy } from '../../domain/value-objects/payout-policy.value-object';
import type { GetPayoutPolicyUseCase } from './get-payout-policy.use-case';
import type { RecordSettlementWithholdingUseCase } from './record-settlement-withholding.use-case';
import { StartNoShowSettlementWindowUseCase } from './start-no-show-settlement-window.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';
const SERVICE_DATE = new Date('2026-08-10T02:00:00Z');

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: 'settlement-1',
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    partnerId: PARTNER_ID,
    status: 'held',
    kind: 'service_completed',
    onlineHeldAmount: 400_000n,
    onsiteCollectedAmount: 0n,
    securityDepositHeld: 0n,
    refundedAmount: 0n,
    retainedAmount: 0n,
    ...overrides,
  }) as unknown as SettlementRecord;

interface Options {
  record?: SettlementRecord | null;
  bookingMissing?: boolean;
  opened?: SettlementRecord | null;
}

function harness(options: Options = {}) {
  const windows: Array<Record<string, unknown>> = [];
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
                totalAmount: 1_000_000n,
                finalAmount: 1_000_000n,
                paidAmount: 400_000n,
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
    useCase: new StartNoShowSettlementWindowUseCase(
      fakePort<ISettlementRepository>({
        ensureHeldForBooking: () =>
          Promise.resolve(options.record === undefined ? settlement() : options.record),
        startDisputeWindow: (_tx, bookingId, onsite, days, amounts, kind) => {
          windows.push({ bookingId, onsite, days, amounts, kind });
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
              payout: { holdingDays: 3, minAmount: '0', cycle: 'monthly' },
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

describe('StartNoShowSettlementWindowUseCase', () => {
  it('refuses when the booking cannot be read', async () => {
    const { useCase } = harness({ bookingMissing: true });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(
      FinanceBookingNotFound,
    );
  });

  it('refuses when no held settlement exists', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(
      HeldSettlementMissing,
    );
  });

  it('opens a customer_no_show window rather than recognising revenue at once', async () => {
    // Same rule as a normal completion: the transaction is accepted here, so tax
    // is assessed here — but the money only becomes payable after the window.
    const { useCase, tenantDb, windows, withholdings } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(windows[0]).toMatchObject({ bookingId: BOOKING_ID, kind: 'customer_no_show', days: 3 });
    expect(withholdings).toHaveLength(1);
  });

  it('bases the no-show settlement on what was actually held, not the full price', async () => {
    // The customer never arrived, so only the deposit is in hand; billing the
    // whole booking would assess tax on money nobody paid.
    const { useCase, windows } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(windows[0]?.amounts).toMatchObject({ partnerGrossEarning: 400_000n });
  });

  it('is a no-op once the window is already open', async () => {
    const { useCase, windows } = harness({ record: settlement({ status: 'dispute_window' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(windows).toEqual([]);
  });

  it('assesses no tax when the guarded window write matched no row', async () => {
    const { useCase, withholdings } = harness({ opened: null });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(withholdings).toEqual([]);
  });
});
