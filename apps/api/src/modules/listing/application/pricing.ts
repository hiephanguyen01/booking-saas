import {
  computeQuoteResponse,
  PricingError,
  type PricedQuote,
  type QuoteInput,
} from '../../../shared/domain/pricing/quote-calculator';
import { ListingPricingRejected } from '../domain/errors/pricing-rule-errors';

/**
 * Prices a quote via the pure {@link computeQuoteResponse} calculator, mapping
 * pricing errors to 400s. Plain function, no DI (replaces the former
 * application-service quote method) — used by the public quote endpoint, scheduling
 * availability (Task 1.6), and booking creation (Task 1.7).
 */
export function priceQuote(input: QuoteInput): PricedQuote {
  try {
    return computeQuoteResponse(input);
  } catch (err) {
    if (err instanceof PricingError) {
      throw new ListingPricingRejected(err.code, err.message);
    }
    throw err;
  }
}
