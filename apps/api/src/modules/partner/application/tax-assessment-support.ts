import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { DEFAULT_TIMEZONE, wallClockInZone, zonedTimeToUtc } from '../../../shared/time/time';
import { selectThresholdRule } from '../../../shared/domain/tax/threshold';
import { TaxThresholdRuleUnavailable } from './partner-http-errors';
import type {
  IPartnerTaxRepository,
  PartnerTaxAssessmentRecord,
} from '../domain/ports/partner-tax-repository.port';

export function vietnamTaxPeriod(date: Date): { year: number; quarter: number } {
  const wall = wallClockInZone(date, DEFAULT_TIMEZONE);
  return { year: wall.year, quarter: Math.floor((wall.month - 1) / 3) + 1 };
}

export function vietnamTaxYearStart(year: number): Date {
  return zonedTimeToUtc({ year, month: 1, day: 1 }, DEFAULT_TIMEZONE);
}

export function vietnamTaxYearEnd(year: number): Date {
  return zonedTimeToUtc({ year: year + 1, month: 1, day: 1 }, DEFAULT_TIMEZONE);
}

export async function ensurePartnerTaxAssessment(
  tx: PrismaTx,
  repository: IPartnerTaxRepository,
  input: { tenantId: string; partnerId: string; taxYear: number },
): Promise<PartnerTaxAssessmentRecord> {
  const rules = await repository.listActiveThresholdRules(tx);
  const rule = selectThresholdRule(rules, vietnamTaxYearStart(input.taxYear));
  if (!rule) throw new TaxThresholdRuleUnavailable();
  return repository.ensureAssessment(tx, {
    ...input,
    thresholdRuleId: rule.id,
    thresholdAmount: rule.thresholdAmount,
    initialStatus: 'missing_declaration',
  });
}
