import { BadRequestException, Injectable } from '@nestjs/common';
import type { BookingMode, ModeConfig, QuoteResponse } from '@booking/contracts';
import {
  computeQuote,
  PricingError,
  type PricingRuleView,
} from '../../domain/pricing/quote-calculator';

export interface QuoteInput {
  mode: BookingMode;
  modeConfig: ModeConfig;
  pricingRules: PricingRuleView[];
  timezone: string;
  startUtc: Date;
  endUtc: Date;
  quantity: number;
  depositPercent: number;
}

/**
 * Wraps the pure {@link computeQuote} calculator, mapping VND bigints to the
 * digit-string transport shape and pricing errors to 400s. Exported by
 * ListingModule for Task 1.7 (bookings) to price a quote before checkout.
 */
@Injectable()
export class PricingService {
  quote(input: QuoteInput): QuoteResponse {
    let result;
    try {
      result = computeQuote(input);
    } catch (err) {
      if (err instanceof PricingError) {
        throw new BadRequestException({ statusCode: 400, code: err.code, message: err.message });
      }
      throw err;
    }
    return {
      currency: 'VND',
      mode: result.mode,
      subtotal: result.subtotal.toString(),
      depositAmount: result.depositAmount.toString(),
      securityDeposit: result.securityDeposit.toString(),
      lineItems: result.lineItems.map((l) => ({
        label: l.label,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toString(),
        amount: l.amount.toString(),
        ...(l.appliedRuleId ? { appliedRuleId: l.appliedRuleId } : {}),
        ...(l.block ? { block: true } : {}),
      })),
    };
  }
}
