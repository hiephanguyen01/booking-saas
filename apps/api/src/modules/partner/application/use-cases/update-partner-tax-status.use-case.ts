import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePartnerTaxStatusInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

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
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    input: UpdatePartnerTaxStatusInput,
  ): Promise<PartnerRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.partners.findStateById(tx, partnerId);
      if (!existing) throw new PartnerNotFound();
      return this.partners.updateTaxStatus(tx, partnerId, input.taxStatus);
    });
  }
}
