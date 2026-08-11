import type { PartnerTaxAssessmentResponse } from '@booking/contracts';
import type { PartnerTaxAssessmentRecord } from '../domain/ports/partner-tax-repository.port';

export function toPartnerTaxAssessmentResponse(
  assessment: PartnerTaxAssessmentRecord,
  taxStatus: PartnerTaxAssessmentResponse['taxStatus'],
): PartnerTaxAssessmentResponse {
  const totalRevenue = assessment.platformRevenue + assessment.externalRevenue;
  const remainingAmount =
    totalRevenue < assessment.thresholdAmount ? assessment.thresholdAmount - totalRevenue : 0n;
  return {
    partnerId: assessment.partnerId,
    taxYear: assessment.taxYear,
    status: assessment.status,
    taxStatus,
    classificationSource: assessment.classificationSource,
    platformRevenue: assessment.platformRevenue.toString(),
    externalRevenue: assessment.externalRevenue.toString(),
    totalRevenue: totalRevenue.toString(),
    thresholdAmount: assessment.thresholdAmount.toString(),
    remainingAmount: remainingAmount.toString(),
    legalRef: assessment.thresholdLegalRef,
    thresholdRevision: assessment.thresholdRevision,
    crossedAt: assessment.crossedAt?.toISOString() ?? null,
    crossedQuarter: assessment.crossedQuarter,
    declarationUpdatedAt: assessment.declarationUpdatedAt?.toISOString() ?? null,
    manualOverrideStatus: assessment.manualOverrideStatus,
    manualOverrideReason: assessment.manualOverrideReason,
    manualOverrideUntil: assessment.manualOverrideUntil?.toISOString() ?? null,
    evaluatedAt: assessment.evaluatedAt.toISOString(),
  };
}
