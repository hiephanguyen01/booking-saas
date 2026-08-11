import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePartnerTaxStatusInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import {
  PARTNER_TAX_REPOSITORY,
  type IPartnerTaxRepository,
} from '../../domain/ports/partner-tax-repository.port';
import {
  ensurePartnerTaxAssessment,
  vietnamTaxPeriod,
  vietnamTaxYearEnd,
} from '../tax-assessment-support';

/**
 * Tenant sets a partner's tax status (§VAT).
 *
 * A narrow action rather than part of a general partner PATCH, because this one
 * field decides the partner's VAT regime — `company_vat` bills 8%/10% by the
 * deduction method, a declaring household 4%/5% by the percentage method — and
 * will later decide whether their payout is withheld from. Misclassifying a
 * partner silently mis-taxes every one of their bookings.
 *
 * Existing bookings never move: they replay the rate frozen in their
 * `commission_snapshot`. Only bookings made after the change use the new regime.
 */
@Injectable()
export class UpdatePartnerTaxStatusUseCase {
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
    input: UpdatePartnerTaxStatusInput,
    actorId: string,
  ): Promise<PartnerRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.partners.findByIdForUpdate(tx, partnerId);
      if (!existing) throw new PartnerNotFound();
      const now = await this.tenantDb.databaseNow(tx);
      if (
        input.taxStatus === 'household_below_threshold' ||
        input.taxStatus === 'household_declaring'
      ) {
        const taxYear = vietnamTaxPeriod(now).year;
        const ensured = await ensurePartnerTaxAssessment(tx, this.tax, {
          tenantId,
          partnerId,
          taxYear,
        });
        const assessment = await this.tax.lockAssessment(tx, ensured.id);
        if (!assessment) throw new Error('Tax assessment disappeared while acquiring its lock');
        await this.tax.setManualOverride(tx, assessment.id, {
          status: input.taxStatus,
          reason: input.reason,
          actorId,
          until: vietnamTaxYearEnd(taxYear),
          evaluatedAt: now,
        });
      }
      const updated = await this.partners.updateTaxStatus(tx, partnerId, input.taxStatus);
      await this.audit.write(tx, {
        tenantId,
        actorUserId: actorId,
        action: 'partner.tax_status_overridden',
        entityType: 'partner',
        entityId: partnerId,
        data: { from: existing.taxStatus, to: input.taxStatus, reason: input.reason },
      });
      if (existing.taxStatus !== input.taxStatus) {
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'partner.tax_classification_changed',
          payload: {
            partnerId,
            from: existing.taxStatus,
            to: input.taxStatus,
            reason: 'manual_override',
          },
        });
      }
      return updated;
    });
  }
}
