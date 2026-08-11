import {
  TaxFilingNotPayable,
  TaxFilingNotSubmittable,
} from '../errors/finance-domain-errors';
import type { TaxFilingState } from '../ports/tax-compliance-repository.port';

export class TaxFiling {
  private constructor(private readonly status: TaxFilingState) {}

  static rehydrate(status: TaxFilingState): TaxFiling {
    return new TaxFiling(status);
  }

  assertSubmittable(): void {
    if (this.status !== 'draft') throw new TaxFilingNotSubmittable();
  }

  assertPayable(): void {
    if (this.status !== 'submitted') throw new TaxFilingNotPayable();
  }
}
