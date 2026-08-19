import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import type { ITaxComplianceRepository } from '../../domain/ports/tax-compliance-repository.port';
import { GetBookingSettlementUseCase } from './get-booking-settlement.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';

const settlement = (partnerId = PARTNER_ID): SettlementRecord =>
  ({ id: 'settlement-1', bookingId: BOOKING_ID, partnerId }) as unknown as SettlementRecord;

function harness(record: SettlementRecord | null, taxPosition: unknown = { assessments: [] }) {
  const taxCalls: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetBookingSettlementUseCase(
      fakePort<ISettlementRepository>({ findByBooking: () => Promise.resolve(record) }),
      fakePort<ITaxComplianceRepository>({
        taxPositionForSettlement: (_tx, settlementId) => {
          taxCalls.push(settlementId);
          return Promise.resolve(taxPosition as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    taxCalls,
  };
}

describe('GetBookingSettlementUseCase', () => {
  it('returns the settlement with its tax trail', async () => {
    // The trail comes from the append-only event log, not the settlement's own
    // withheld columns, which are recomputed on release and cannot show what was
    // originally assessed.
    const { useCase, tenantDb, taxCalls } = harness(settlement());

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toMatchObject({
      settlement: { id: 'settlement-1' },
      taxPosition: { assessments: [] },
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(taxCalls).toEqual(['settlement-1']);
  });

  it('answers null for a booking with no settlement yet', async () => {
    const { useCase, taxCalls } = harness(null);

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBeNull();
    expect(taxCalls).toEqual([]);
  });

  it("answers null, not the row, for another partner's settlement", async () => {
    // Same reasoning as the booking reads: a distinguishable error would confirm
    // the booking exists.
    const { useCase, taxCalls } = harness(settlement('partner-2'));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, PARTNER_ID)).resolves.toBeNull();
    expect(taxCalls).toEqual([]);
  });

  it('lets a tenant-scoped caller read any settlement', async () => {
    const { useCase } = harness(settlement('partner-2'));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.not.toBeNull();
  });
});
