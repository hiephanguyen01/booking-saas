import { Inject, Injectable } from '@nestjs/common';
import {
  evaluateHouseholdThreshold,
  selectThresholdRule,
} from '../../../../shared/domain/tax/threshold';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
} from '../../domain/ports/partner-repository.port';
import {
  PARTNER_TAX_REPOSITORY,
  type IPartnerTaxRepository,
} from '../../domain/ports/partner-tax-repository.port';
import {
  ensurePartnerTaxAssessment,
  vietnamTaxPeriod,
  vietnamTaxYearEnd,
  vietnamTaxYearStart,
} from '../tax-assessment-support';
import { TaxThresholdRuleUnavailable } from '../partner-http-errors';

@Injectable()
export class ReassessPartnerTaxThresholdUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(PARTNER_TAX_REPOSITORY) private readonly tax: IPartnerTaxRepository,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, partnerId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const partner = await this.partners.findByIdForUpdate(tx, partnerId);
      if (
        !partner ||
        partner.isHouse ||
        (partner.taxStatus !== 'household_below_threshold' &&
          partner.taxStatus !== 'household_declaring')
      ) {
        return;
      }
      const now = await this.tenantDb.databaseNow(tx);
      const period = vietnamTaxPeriod(now);
      const existing = await this.tax.findAssessment(tx, partnerId, period.year);
      const rules = await this.tax.listActiveThresholdRules(tx);
      const rule = selectThresholdRule(rules, vietnamTaxYearStart(period.year));
      if (!rule) throw new TaxThresholdRuleUnavailable();
      const legalRuleChanged = existing !== null && existing.thresholdRuleId !== rule.id;
      const ensured = await ensurePartnerTaxAssessment(tx, this.tax, {
        tenantId,
        partnerId,
        taxYear: period.year,
      });
      const assessment = await this.tax.lockAssessment(tx, ensured.id);
      if (!assessment) throw new Error('Tax assessment disappeared while acquiring its lock');

      const facts = await this.tax.listReleasedRevenueFacts(
        tx,
        partnerId,
        vietnamTaxYearStart(period.year),
        vietnamTaxYearEnd(period.year),
      );
      for (const fact of facts) {
        await this.tax.insertRevenueEvent(tx, {
          tenantId,
          partnerId,
          assessmentId: assessment.id,
          sourceType: 'settlement_release',
          sourceId: fact.journalId,
          amount: fact.amount,
          serviceDate: fact.serviceDate,
          metadata: { bookingId: fact.bookingId, backfilled: true },
        });
      }
      const platformRevenue = await this.tax.sumPlatformRevenue(tx, assessment.id);
      const manualOverrideActive =
        assessment.manualOverrideUntil !== null && assessment.manualOverrideUntil > now;
      const decision = evaluateHouseholdThreshold({
        platformRevenue,
        externalRevenue: assessment.externalRevenue,
        hasDeclaration: assessment.declarationUpdatedAt !== null,
        thresholdAmount: rule.thresholdAmount,
        previousStatus: assessment.status,
        allowLegalDowngrade: legalRuleChanged,
        manualOverrideStatus: assessment.manualOverrideStatus,
        manualOverrideActive,
      });
      const updated = await this.tax.updateAssessment(tx, assessment.id, {
        status: decision.status,
        platformRevenue,
        externalRevenue: assessment.externalRevenue,
        thresholdAmount: rule.thresholdAmount,
        thresholdRuleId: rule.id,
        crossedAt: decision.crossedNow ? now : assessment.crossedAt,
        crossedQuarter: decision.crossedNow ? period.quarter : assessment.crossedQuarter,
        classificationSource: manualOverrideActive
          ? 'manual_override'
          : legalRuleChanged
            ? 'legal_rule'
            : 'automatic_threshold',
        evaluatedAt: now,
      });
      if (partner.taxStatus !== decision.taxStatus) {
        await this.partners.updateTaxStatus(tx, partnerId, decision.taxStatus);
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'partner.tax_classification_changed',
          payload: {
            partnerId,
            taxYear: updated.taxYear,
            from: partner.taxStatus,
            to: decision.taxStatus,
            reason: legalRuleChanged ? 'legal_rule_changed' : 'scheduled_reassessment',
          },
        });
      }
    });
  }
}
