import { describe, expect, it } from 'vitest';
import type { RespondSettlementDisputeInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { DisputeResponseNotAccepted } from '../../domain/errors/finance-domain-errors';
import type {
  ISettlementDisputeRepository,
  SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import { RespondSettlementDisputeUseCase } from './respond-settlement-dispute.use-case';

const TENANT_ID = 'tenant-1';
const DISPUTE_ID = 'dispute-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';

const dispute = () =>
  ({ id: DISPUTE_ID, bookingId: BOOKING_ID, status: 'open' }) as unknown as SettlementDisputeRecord;

function harness(responded: SettlementDisputeRecord | null) {
  const calls: unknown[] = [];
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
  return {
    useCase: new RespondSettlementDisputeUseCase(
      fakePort<ISettlementDisputeRepository>({
        respond: (_tx, disputeId, partnerId, response, actorId) => {
          calls.push({ disputeId, partnerId, response, actorId });
          return Promise.resolve(responded);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    calls,
    events,
  };
}

const input = { response: 'Phòng đúng như mô tả' } as RespondSettlementDisputeInput;

describe('RespondSettlementDisputeUseCase', () => {
  it('records the response against the partner and announces it', async () => {
    // The partner id goes into the guarded write itself, so a partner cannot
    // answer a claim on a booking that is not theirs.
    const { useCase, tenantDb, calls, events } = harness(dispute());

    await useCase.execute(TENANT_ID, DISPUTE_ID, PARTNER_ID, 'staff-1', input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([
      {
        disputeId: DISPUTE_ID,
        partnerId: PARTNER_ID,
        response: 'Phòng đúng như mô tả',
        actorId: 'staff-1',
      },
    ]);
    expect(events).toEqual([
      {
        eventType: 'settlement.dispute_responded',
        payload: { disputeId: DISPUTE_ID, bookingId: BOOKING_ID, partnerId: PARTNER_ID },
      },
    ]);
  });

  it('refuses when the guarded write accepted nothing', async () => {
    // Wrong partner, already resolved, or a second response — the repository
    // returns null and this must not announce a response that did not happen.
    const { useCase, events } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, DISPUTE_ID, PARTNER_ID, 'staff-1', input),
    ).rejects.toBeInstanceOf(DisputeResponseNotAccepted);
    expect(events).toEqual([]);
  });
});
