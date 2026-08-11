import type { PartnerTaxStatus } from './tax';

export const HOUSEHOLD_REVENUE_THRESHOLD_CODE = 'household_annual_revenue';

export interface TaxThresholdRule {
  id: string;
  thresholdAmount: bigint;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  legalRef: string;
  revision: number;
}

export type TaxAssessmentStatus =
  'missing_declaration' | 'below_threshold' | 'exceeded' | 'manual_review';

export interface TaxAssessmentDecision {
  status: TaxAssessmentStatus;
  taxStatus: Extract<PartnerTaxStatus, 'household_declaring' | 'household_below_threshold'>;
  totalRevenue: bigint;
  crossedNow: boolean;
}

export function selectThresholdRule(
  rules: readonly TaxThresholdRule[],
  at: Date,
): TaxThresholdRule | null {
  const time = at.getTime();
  return (
    rules
      .filter(
        (rule) =>
          rule.effectiveFrom.getTime() <= time &&
          (rule.effectiveTo === null || time < rule.effectiveTo.getTime()),
      )
      .sort(
        (a, b) => b.revision - a.revision || b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
      )[0] ?? null
  );
}

/**
 * Household classification is deliberately conservative: until the partner
 * declares revenue earned outside BookingOS, quotes use the declaring regime.
 * A revenue-driven crossing is sticky for the tax year so refunds cannot make
 * the status oscillate; an explicit legal-rule reassessment may move it down.
 */
export function evaluateHouseholdThreshold(input: {
  platformRevenue: bigint;
  externalRevenue: bigint;
  hasDeclaration: boolean;
  thresholdAmount: bigint;
  previousStatus: TaxAssessmentStatus | null;
  allowLegalDowngrade?: boolean;
  manualOverrideStatus?: PartnerTaxStatus | null;
  manualOverrideActive?: boolean;
}): TaxAssessmentDecision {
  const totalRevenue = input.platformRevenue + input.externalRevenue;
  if (
    input.manualOverrideActive &&
    (input.manualOverrideStatus === 'household_declaring' ||
      input.manualOverrideStatus === 'household_below_threshold')
  ) {
    return {
      status: input.manualOverrideStatus === 'household_declaring' ? 'exceeded' : 'below_threshold',
      taxStatus: input.manualOverrideStatus,
      totalRevenue,
      crossedNow: false,
    };
  }

  if (totalRevenue > input.thresholdAmount) {
    return {
      status: 'exceeded',
      taxStatus: 'household_declaring',
      totalRevenue,
      crossedNow: input.previousStatus !== 'exceeded',
    };
  }

  if (input.previousStatus === 'exceeded' && !input.allowLegalDowngrade) {
    return {
      status: 'manual_review',
      taxStatus: 'household_declaring',
      totalRevenue,
      crossedNow: false,
    };
  }

  if (!input.hasDeclaration) {
    return {
      status: 'missing_declaration',
      taxStatus: 'household_declaring',
      totalRevenue,
      crossedNow: false,
    };
  }

  return {
    status: 'below_threshold',
    taxStatus: 'household_below_threshold',
    totalRevenue,
    crossedNow: false,
  };
}
