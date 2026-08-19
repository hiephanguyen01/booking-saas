import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  DisputeNotFound,
  DisputeNotResolvable,
  InvalidDisputeRefundAmount,
  PartialRefundMustBePartial,
} from '../../domain/errors/finance-domain-errors';
import type {
  ISettlementDisputeRepository,
  SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { ResolveSettlementDisputeUseCase } from './resolve-settlement-dispute.use-case';

const TENANT_ID = 'tenant-1';
const DISPUTE_ID = 'dispute-1';
const SETTLEMENT_ID = 'settlement-1';
const BOOKING_ID = 'booking-1';
const ACTOR = 'staff-1';
const HELD = 500_000n;

const dispute = (overrides: Partial<SettlementDisputeRecord> = {}): SettlementDisputeRecord =>
  ({
    id: DISPUTE_ID,
    tenantId: TENANT_ID,
    settlementId: SETTLEMENT_ID,
    bookingId: BOOKING_ID,
    openedByUserId: 'customer-1',
    openedByRole: 'customer',
    onlineHeldAmount: HELD,
    remainingHeldAmount: HELD,
    reason: 'Phòng không như mô tả',
    evidence: [],
    status: 'open',
    resolution: null,
    ...overrides,
  }) as unknown as SettlementDisputeRecord;

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: SETTLEMENT_ID,
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    status: 'disputed',
    onlineHeldAmount: HELD,
    refundedAmount: 0n,
    ...overrides,
  }) as unknown as SettlementRecord;

interface Options {
  record?: SettlementDisputeRecord | null;
  settlementRecord?: SettlementRecord | null;
  releaseAccepted?: boolean;
  resolved?: SettlementDisputeRecord | null;
}

function harness(options: Options = {}) {
  const calls: string[] = [];
  const prepared: Array<{ bookingId: string; amount: bigint }> = [];
  const resolutions: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });

  const useCase = new ResolveSettlementDisputeUseCase(
    fakePort<ISettlementRepository>({
      findById: () =>
        Promise.resolve(
          options.settlementRecord === undefined ? settlement() : options.settlementRecord,
        ),
      resolveDisputeForRelease: () => {
        calls.push('releaseHold');
        return Promise.resolve(options.releaseAccepted ?? true);
      },
      prepareRefund: (_tx, bookingId, amount) => {
        calls.push('prepareRefund');
        prepared.push({ bookingId, amount });
        return Promise.resolve(null as never);
      },
    }),
    fakePort<ISettlementDisputeRepository>({
      findById: () => Promise.resolve(options.record === undefined ? dispute() : options.record),
      resolve: (_tx, _id, data) => {
        calls.push('resolve');
        resolutions.push(data);
        return Promise.resolve(
          options.resolved === undefined ? dispute({ status: 'resolved' }) : options.resolved,
        );
      },
    }),
    tenantDb.service,
    new OutboxService(),
  );

  return { useCase, calls, prepared, resolutions, events };
}

describe('ResolveSettlementDisputeUseCase', () => {
  it('rejects an unknown dispute', async () => {
    const { useCase } = harness({ record: null });

    await expect(
      useCase.execute(TENANT_ID, DISPUTE_ID, { resolution: 'release' } as never, ACTOR),
    ).rejects.toBeInstanceOf(DisputeNotFound);
  });

  it('returns an already-resolved dispute untouched', async () => {
    const { useCase, calls, events } = harness({ record: dispute({ status: 'resolved' }) });

    await useCase.execute(TENANT_ID, DISPUTE_ID, { resolution: 'release' } as never, ACTOR);

    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it('rejects a dispute whose settlement has vanished', async () => {
    const { useCase } = harness({ settlementRecord: null });

    await expect(
      useCase.execute(TENANT_ID, DISPUTE_ID, { resolution: 'release' } as never, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('releases the hold and asks for the settlement to be released', async () => {
    const { useCase, calls, resolutions, events } = harness();

    await useCase.execute(
      TENANT_ID,
      DISPUTE_ID,
      { resolution: 'release', note: 'ok' } as never,
      ACTOR,
    );

    expect(calls).toEqual(['releaseHold', 'resolve']);
    expect(resolutions[0]).toMatchObject({
      // A release REJECTS the customer's claim — the money goes to the partner.
      status: 'rejected',
      resolution: 'release',
      refundAmount: 0n,
      resolvedBy: ACTOR,
    });
    expect(events.map((event) => event.eventType)).toEqual([
      'settlement.release_requested',
      'settlement.dispute_resolved',
    ]);
  });

  it('refuses the release when the settlement would not accept it', async () => {
    const { useCase, calls } = harness({ releaseAccepted: false });

    await expect(
      useCase.execute(TENANT_ID, DISPUTE_ID, { resolution: 'release' } as never, ACTOR),
    ).rejects.toBeInstanceOf(DisputeNotResolvable);
    expect(calls).not.toContain('resolve');
  });

  it('refunds the whole remaining hold on a full refund', async () => {
    const { useCase, prepared, events } = harness();

    await useCase.execute(TENANT_ID, DISPUTE_ID, { resolution: 'full_refund' } as never, ACTOR);

    expect(prepared).toEqual([{ bookingId: BOOKING_ID, amount: HELD }]);
    expect(events[0]).toEqual({
      eventType: 'settlement.refund_requested',
      payload: {
        bookingId: BOOKING_ID,
        amount: HELD.toString(),
        // A full refund takes the booking down with it; a partial one does not.
        affectsBookingStatus: true,
      },
    });
  });

  it('refunds only the remaining hold when part of it is already refunded', async () => {
    const { useCase, prepared, events } = harness({
      settlementRecord: settlement({ refundedAmount: 200_000n }),
    });

    await useCase.execute(TENANT_ID, DISPUTE_ID, { resolution: 'full_refund' } as never, ACTOR);

    // 500,000 held − 200,000 already refunded = 300,000 left to give back, and the
    // settlement's cumulative refunded figure becomes the full 500,000.
    expect(prepared).toEqual([{ bookingId: BOOKING_ID, amount: HELD }]);
    expect(events[0]?.payload).toMatchObject({ amount: '300000' });
  });

  it('leaves the booking status alone on a partial refund', async () => {
    const { useCase, prepared, events } = harness();

    await useCase.execute(
      TENANT_ID,
      DISPUTE_ID,
      { resolution: 'partial_refund', refundAmount: '150000' } as never,
      ACTOR,
    );

    expect(prepared).toEqual([{ bookingId: BOOKING_ID, amount: 150_000n }]);
    expect(events[0]?.payload).toMatchObject({ amount: '150000', affectsBookingStatus: false });
  });

  it('refuses a partial refund that is really a full one', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(
        TENANT_ID,
        DISPUTE_ID,
        { resolution: 'partial_refund', refundAmount: HELD.toString() } as never,
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(PartialRefundMustBePartial);
  });

  it.each(['0', '600000'])('refuses a refund of %s against a 500,000 hold', async (amount) => {
    const { useCase } = harness();

    await expect(
      useCase.execute(
        TENANT_ID,
        DISPUTE_ID,
        { resolution: 'partial_refund', refundAmount: amount } as never,
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(InvalidDisputeRefundAmount);
  });

  it('fails when the guarded resolve matched no row', async () => {
    const { useCase } = harness({ resolved: null });

    await expect(
      useCase.execute(TENANT_ID, DISPUTE_ID, { resolution: 'release' } as never, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
