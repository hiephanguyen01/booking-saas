import { BadRequestException } from '@nestjs/common';
import type { QuoteResponse } from '@booking/contracts';
import {
  computeQuoteResponse,
  PricingError,
  type QuoteInput,
} from '../domain/pricing/quote-calculator';

/**
 * Prices a quote via the pure {@link computeQuoteResponse} calculator, mapping
 * pricing errors to 400s. Plain function, no DI (replaces the former
 * application-service quote method) — used by the public quote endpoint, scheduling
 * availability (Task 1.6), and booking creation (Task 1.7).
 */
export function priceQuote(input: QuoteInput): QuoteResponse {
  try {
    return computeQuoteResponse(input);
  } catch (err) {
    if (err instanceof PricingError) {
      throw new BadRequestException({ statusCode: 400, code: err.code, message: err.message });
    }
    throw err;
  }
}
