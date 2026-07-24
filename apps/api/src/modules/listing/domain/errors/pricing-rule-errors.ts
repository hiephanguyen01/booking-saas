import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the PricingRule aggregate. Codes + statuses + messages are
 * byte-identical to the pre-refactor use-case behaviour.
 */

export class ModeNotEnabled extends DomainError {
  constructor(mode: string) {
    super('MODE_NOT_ENABLED', 400, `Listing does not enable "${mode}"`);
  }
}

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
