import { describe, expect, it } from 'vitest';
import type { ReplyReviewInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { Review, type ReviewState } from '../../domain/entities/review.entity';
import { ReviewReplyNotAccepted } from '../../domain/errors/review-errors';
import type {
  IReviewRepository,
  ReviewRecord,
} from '../../domain/ports/review-repository.port';
import { ReplyReviewUseCase } from './reply-review.use-case';

const TENANT_ID = 'tenant-1';
const REVIEW_ID = 'review-1';
const PARTNER_ID = 'partner-1';
const AUTHOR_ID = 'user-staff';

const state = (overrides: Partial<ReviewState> = {}): ReviewState =>
  ({
    id: REVIEW_ID,
    partnerId: PARTNER_ID,
    bookingId: 'booking-1',
    reply: null,
    ...overrides,
  }) as ReviewState;

function harness(found: ReviewState | null = state()) {
  const saved: Review[] = [];
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
    useCase: new ReplyReviewUseCase(
      fakePort<IReviewRepository>({
        loadForReply: () => Promise.resolve(found),
        saveReply: (_tx, _tenantId, review) => {
          saved.push(review);
          return Promise.resolve({ id: REVIEW_ID, bookingId: 'booking-1' } as unknown as ReviewRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    saved,
    events,
  };
}

const input = { content: 'Cảm ơn bạn đã ghé!' } as ReplyReviewInput;

describe('ReplyReviewUseCase', () => {
  it('answers the same refusal for a review that does not exist', async () => {
    // One wire code for every reason a reply is not accepted, so the response
    // never reveals whether the review is real.
    const { useCase, saved } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, REVIEW_ID, PARTNER_ID, AUTHOR_ID, input),
    ).rejects.toBeInstanceOf(ReviewReplyNotAccepted);
    expect(saved).toEqual([]);
  });

  it("refuses to reply to ANOTHER partner's review", async () => {
    const { useCase, saved } = harness(state({ partnerId: 'partner-2' }));

    await expect(
      useCase.execute(TENANT_ID, REVIEW_ID, PARTNER_ID, AUTHOR_ID, input),
    ).rejects.toBeInstanceOf(ReviewReplyNotAccepted);
    expect(saved).toEqual([]);
  });

  it('refuses a SECOND reply', async () => {
    // A partner gets one public response; editing it later would let them
    // rewrite the exchange after the fact.
    const { useCase, saved } = harness(
      state({ reply: { partnerId: PARTNER_ID, content: 'Đã trả lời' } as never }),
    );

    await expect(
      useCase.execute(TENANT_ID, REVIEW_ID, PARTNER_ID, AUTHOR_ID, input),
    ).rejects.toBeInstanceOf(ReviewReplyNotAccepted);
    expect(saved).toEqual([]);
  });

  it('queues the reply with its author and saves it', async () => {
    const { useCase, saved, tenantDb } = harness();

    await useCase.execute(TENANT_ID, REVIEW_ID, PARTNER_ID, AUTHOR_ID, input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(saved[0]?.pendingReply()).toEqual({
      partnerId: PARTNER_ID,
      authorUserId: AUTHOR_ID,
      content: 'Cảm ơn bạn đã ghé!',
    });
  });

  it('announces the reply so the customer is notified', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, REVIEW_ID, PARTNER_ID, AUTHOR_ID, input);

    expect(events).toEqual([
      {
        eventType: 'review.replied',
        payload: { reviewId: REVIEW_ID, bookingId: 'booking-1' },
      },
    ]);
  });
});
