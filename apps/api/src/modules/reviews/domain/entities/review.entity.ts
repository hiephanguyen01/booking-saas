import { Rating } from '../value-objects/rating';
import { ReviewContent } from '../value-objects/review-content';
import { ReviewReplyNotAccepted } from '../errors/review-errors';

/**
 * Review aggregate root (§16). Owns the two write invariants that used to live in
 * Prisma where-clauses / use-cases:
 *   - create eligibility (owned + completed + not-yet-reviewed booking) — resolved
 *     by the repository's `findEligibleBooking`, then assembled via {@link Review.open};
 *   - reply-once + partner-ownership — enforced by {@link Review.addReply}.
 *
 * Framework-free: no Nest, no Prisma. Money/date serialisation and the fat
 * read-projection (`ReviewRecord`) stay in the mapper / read side.
 */

/** Booking facts the create path needs, resolved by the repo eligibility read. */
export interface EligibleBooking {
  id: string;
  listingId: string;
  groupId: string | null;
  partnerId: string;
}

/** Validated insert payload for a brand-new review (id/timestamps assigned by the DB). */
export interface NewReview {
  bookingId: string;
  listingId: string;
  groupId: string | null;
  partnerId: string;
  customerId: string;
  rating: number;
  content: string;
}

/** The reply to append, before the DB assigns its id/createdAt. */
export interface PendingReply {
  partnerId: string;
  authorUserId: string;
  content: string;
}

/** The persisted write-state of a review needed to enforce the reply invariant. */
export interface ReviewState {
  id: string;
  bookingId: string;
  partnerId: string;
  /** Presence (non-null) means a reply already exists. */
  reply: { partnerId: string } | null;
}

export class Review {
  private pendingReply: PendingReply | null;

  private constructor(
    private readonly state: ReviewState,
    pendingReply: PendingReply | null,
  ) {
    this.pendingReply = pendingReply;
  }

  /** Rehydrate an existing review from persistence (the reply path). */
  static rehydrate(state: ReviewState): Review {
    return new Review(state, null);
  }

  /**
   * Assemble a validated new review from an eligible booking (the create path).
   * Runs the Rating/ReviewContent invariants; the DB assigns id/timestamps on insert.
   */
  static open(input: {
    booking: EligibleBooking;
    customerId: string;
    rating: number;
    content: string;
  }): NewReview {
    const rating = Rating.of(input.rating);
    const content = ReviewContent.of(input.content);
    return {
      bookingId: input.booking.id,
      listingId: input.booking.listingId,
      groupId: input.booking.groupId,
      partnerId: input.booking.partnerId,
      customerId: input.customerId,
      rating: rating.value,
      content: content.value,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get bookingId(): string {
    return this.state.bookingId;
  }

  /**
   * §16 reply invariant (was `where: { id, partnerId, reply: null }`): a review may
   * be replied to exactly once, and only by the partner that owns it. Both failures
   * collapse to {@link ReviewReplyNotAccepted} to preserve the existing wire code.
   */
  addReply(partnerId: string, authorUserId: string, content: ReviewContent): void {
    if (this.state.reply !== null || this.pendingReply !== null) {
      throw new ReviewReplyNotAccepted();
    }
    if (partnerId !== this.state.partnerId) {
      throw new ReviewReplyNotAccepted();
    }
    this.pendingReply = { partnerId, authorUserId, content: content.value };
  }

  /** The reply queued by {@link addReply}, for the repository to persist (null if none). */
  reply(): PendingReply | null {
    return this.pendingReply;
  }
}
