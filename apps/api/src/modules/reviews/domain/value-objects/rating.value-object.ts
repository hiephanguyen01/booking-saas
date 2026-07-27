import { ReviewValidationError } from '../errors/review-errors';

/**
 * A review star rating: an integer 1–5. Value object — construction is the only
 * validation point, so an invalid rating can never exist as a `Rating`.
 */
export class Rating {
  private constructor(readonly value: number) {}

  static of(n: number): Rating {
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new ReviewValidationError('rating', 'Rating must be an integer between 1 and 5');
    }
    return new Rating(n);
  }
}
