import { DomainError } from '../../../../shared/domain/domain-error';

export { ModeNotEnabled } from '../../../../shared/domain/errors/mode-not-enabled';

/**
 * Domain errors for the PricingRule aggregate. Codes + statuses + messages are
 * byte-identical to the pre-refactor use-case behaviour.
 */

export class PackagePricingFixed extends DomainError {
  constructor() {
    super(
      'PACKAGE_PRICING_FIXED',
      400,
      'Fixed-package prices are managed in the listing package configuration',
    );
  }
}

export class PricingRuleNotFound extends DomainError {
  constructor() {
    super('PRICING_RULE_NOT_FOUND', 404, 'Pricing rule not found');
  }
}

export class PricingRuleOverlap extends DomainError {
  constructor(from: string, to: string) {
    // The dash below is an EN DASH (U+2013 "–"), not a hyphen — copied verbatim
    // from create-partner-pricing-rule.use-case.ts.
    super('PRICING_RULE_OVERLAP', 400, `Pricing window overlaps ${from}–${to}`);
  }
}

/**
 * An hourly pricing window must sit inside the date's opening hours — a price
 * on an hour the listing never sells is unreachable, and a partner who sees it
 * saved reasonably assumes those hours became bookable.
 */
export class PricingWindowOutsideOpenHours extends DomainError {
  constructor(openWindows: readonly { openTime: string; closeTime: string }[]) {
    super(
      'PRICING_WINDOW_OUTSIDE_OPEN_HOURS',
      400,
      openWindows.length === 0
        ? 'That date is closed, so it cannot carry a pricing window'
        : `Pricing window must fall inside the opening hours: ${openWindows
            .map((w) => `${w.openTime}-${w.closeTime}`)
            .join(', ')}`,
      { openWindows },
    );
  }
}

/** Maps the framework-free pricing/config calculators' typed rejection. */
export class ListingPricingRejected extends DomainError {
  constructor(code: string, message: string) {
    super(code, 400, message);
  }
}
