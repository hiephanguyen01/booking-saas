import { Inject, Injectable } from '@nestjs/common';
import type { RecordPartnerTaxDeclarationInput } from '@booking/contracts';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { evaluateHouseholdThreshold } from '../../../../shared/domain/tax/threshold';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FutureTaxYearDeclaration,
  PartnerNotFound,
  PartnerTaxAssessmentNotApplicable,
} from '../../domain/errors/partner-errors';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
} from '../../domain/ports/partner-repository.port';
import {
  PARTNER_TAX_REPOSITORY,
  type IPartnerTaxRepository,
  type PartnerTaxAssessmentRecord,
} from '../../domain/ports/partner-tax-repository.port';
import { ensurePartnerTaxAssessment, vietnamTaxPeriod } from '../tax-assessment-support';

@Injectable()
export class RecordPartnerTaxDeclarationUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(PARTNER_TAX_REPOSITORY) private readonly tax: IPartnerTaxRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    input: RecordPartnerTaxDeclarationInput,
    actorId: string,
  ): Promise<{
    assessment: PartnerTaxAssessmentRecord;
    taxStatus: import('@booking/contracts').PartnerTaxStatus;
  }> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const partner = await this.partners.findByIdForUpdate(tx, partnerId);
      if (!partner) throw new PartnerNotFound();
      if (
        partner.isHouse ||
        (partner.taxStatus !== 'household_below_threshold' &&
          partner.taxStatus !== 'household_declaring')
      ) {
        throw new PartnerTaxAssessmentNotApplicable();
      }

      const ensured = await ensurePartnerTaxAssessment(tx, this.tax, {
        tenantId,
        partnerId,
        taxYear: input.taxYear,
      });
      const assessment = await this.tax.lockAssessment(tx, ensured.id);
      if (!assessment) throw new Error('Tax assessment disappeared while acquiring its lock');
      const now = await this.tenantDb.databaseNow(tx);
      const currentPeriod = vietnamTaxPeriod(now);
      if (input.taxYear > currentPeriod.year) throw new FutureTaxYearDeclaration();
      const externalRevenue = BigInt(input.externalRevenue);
      await this.tax.createDeclaration(tx, {
        tenantId,
        partnerId,
        assessmentId: assessment.id,
        externalRevenue,
        declaredByUserId: actorId,
        note: input.note ?? null,
        declaredAt: now,
      });
      const platformRevenue = await this.tax.sumPlatformRevenue(tx, assessment.id);
      const manualOverrideActive =
        assessment.manualOverrideUntil !== null && assessment.manualOverrideUntil > now;
      const decision = evaluateHouseholdThreshold({
        platformRevenue,
        externalRevenue,
        hasDeclaration: true,
        thresholdAmount: assessment.thresholdAmount,
        previousStatus: assessment.status,
        manualOverrideStatus: assessment.manualOverrideStatus,
        manualOverrideActive,
      });
      const updated = await this.tax.updateAssessment(tx, assessment.id, {
        status: decision.status,
        platformRevenue,
        externalRevenue,
        thresholdAmount: assessment.thresholdAmount,
        thresholdRuleId: assessment.thresholdRuleId,
        crossedAt: decision.crossedNow ? now : assessment.crossedAt,
        crossedQuarter:
          decision.crossedNow && input.taxYear === currentPeriod.year
            ? currentPeriod.quarter
            : assessment.crossedQuarter,
        classificationSource: manualOverrideActive ? 'manual_override' : 'external_declaration',
        declarationUpdatedAt: now,
        evaluatedAt: now,
      });
      if (input.taxYear === currentPeriod.year && partner.taxStatus !== decision.taxStatus) {
        await this.partners.updateTaxStatus(tx, partnerId, decision.taxStatus);
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'partner.tax_classification_changed',
          payload: {
            partnerId,
            taxYear: input.taxYear,
            from: partner.taxStatus,
            to: decision.taxStatus,
            reason: 'external_declaration',
          },
        });
      }
      await this.audit.write(tx, {
        tenantId,
        actorUserId: actorId,
        action: 'partner.tax_revenue_declared',
        entityType: 'partner_tax_year_assessment',
        entityId: assessment.id,
        data: { taxYear: input.taxYear, externalRevenue: externalRevenue.toString() },
      });
      return {
        assessment: updated,
        taxStatus: input.taxYear === currentPeriod.year ? decision.taxStatus : partner.taxStatus,
      };
    });
  }
}
