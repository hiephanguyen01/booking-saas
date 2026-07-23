import { ReviewValidationError } from '../errors/review-errors';

/**
 * Review or reply body: trimmed, 10–2000 characters. Value object — the trim +
 * length invariant lives here, mirroring the `.trim().min(10).max(2000)` bounds in
 * `@booking/contracts` (`review.ts`), so it never alters what zod already accepted.
 */
export class ReviewContent {
  private constructor(readonly value: string) {}

  static of(raw: string): ReviewContent {
    const value = raw.trim();
    if (value.length < 10 || value.length > 2000) {
      throw new ReviewValidationError('content', 'Content must be between 10 and 2000 characters');
    }
    return new ReviewContent(value);
  }
}
