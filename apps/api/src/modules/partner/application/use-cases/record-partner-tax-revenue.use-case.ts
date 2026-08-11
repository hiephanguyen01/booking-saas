import { Inject, Injectable } from '@nestjs/common';
import { evaluateHouseholdThreshold } from '../../../../shared/domain/tax/threshold';
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
import { ensurePartnerTaxAssessment, vietnamTaxPeriod } from '../tax-assessment-support';

export interface RecordPartnerTaxRevenueInput {
  partnerId: string;
  sourceType: 'settlement_release' | 'settlement_clawback' | 'backfill_adjustment';
  sourceId: string;
  amount?: bigint;
  reversesSourceId?: string;
  serviceDate: Date;
  bookingId?: string;
}

@Injectable()
export class RecordPartnerTaxRevenueUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(PARTNER_TAX_REPOSITORY) private readonly tax: IPartnerTaxRepository,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, input: RecordPartnerTaxRevenueInput): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const partner = await this.partners.findByIdForUpdate(tx, input.partnerId);
      if (
        !partner ||
        partner.isHouse ||
        (partner.taxStatus !== 'household_below_threshold' &&
          partner.taxStatus !== 'household_declaring')
      ) {
        return;
      }
      const period = vietnamTaxPeriod(input.serviceDate);
      const ensured = await ensurePartnerTaxAssessment(tx, this.tax, {
        tenantId,
        partnerId: input.partnerId,
        taxYear: period.year,
      });
      const assessment = await this.tax.lockAssessment(tx, ensured.id);
      if (!assessment) throw new Error('Tax assessment disappeared while acquiring its lock');

      let amount = input.amount;
      if (input.reversesSourceId) {
        const original = await this.tax.findRevenueAmountBySource(
          tx,
          'settlement_release',
          input.reversesSourceId,
        );
        if (original === null) {
          throw new Error(`Tax revenue source ${input.reversesSourceId} is not available yet`);
        }
        amount = -original;
      }
      if (amount === undefined) throw new Error('Tax revenue event is missing its amount');
      const inserted = await this.tax.insertRevenueEvent(tx, {
        tenantId,
        partnerId: input.partnerId,
        assessmentId: assessment.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        amount,
        serviceDate: input.serviceDate,
        metadata: input.bookingId ? { bookingId: input.bookingId } : {},
      });
      if (!inserted) return;

      const now = await this.tenantDb.databaseNow(tx);
      const platformRevenue = await this.tax.sumPlatformRevenue(tx, assessment.id);
      const manualOverrideActive =
        assessment.manualOverrideUntil !== null && assessment.manualOverrideUntil > now;
      const decision = evaluateHouseholdThreshold({
        platformRevenue,
        externalRevenue: assessment.externalRevenue,
        hasDeclaration: assessment.declarationUpdatedAt !== null,
        thresholdAmount: assessment.thresholdAmount,
        previousStatus: assessment.status,
        manualOverrideStatus: assessment.manualOverrideStatus,
        manualOverrideActive,
      });
      const updated = await this.tax.updateAssessment(tx, assessment.id, {
        status: decision.status,
        platformRevenue,
        externalRevenue: assessment.externalRevenue,
        thresholdAmount: assessment.thresholdAmount,
        thresholdRuleId: assessment.thresholdRuleId,
        crossedAt: decision.crossedNow ? now : assessment.crossedAt,
        crossedQuarter: decision.crossedNow ? period.quarter : assessment.crossedQuarter,
        classificationSource: manualOverrideActive ? 'manual_override' : 'automatic_threshold',
        evaluatedAt: now,
      });
      if (partner.taxStatus !== decision.taxStatus) {
        await this.partners.updateTaxStatus(tx, input.partnerId, decision.taxStatus);
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'partner.tax_classification_changed',
          payload: {
            partnerId: input.partnerId,
            taxYear: updated.taxYear,
            from: partner.taxStatus,
            to: decision.taxStatus,
            reason: decision.crossedNow ? 'threshold_crossed' : 'assessment_updated',
          },
        });
      }
    });
  }
}
