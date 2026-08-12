import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
  type SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import {
  TAX_COMPLIANCE_REPOSITORY,
  type ITaxComplianceRepository,
  type SettlementTaxPosition,
} from '../../domain/ports/tax-compliance-repository.port';

export interface BookingSettlementView {
  settlement: SettlementRecord;
  /**
   * The auditable assessment → reversals → final position trail, or null while
   * the transaction has not been accepted yet. Read from the append-only event
   * trail, NOT from the settlement's own withheld columns, which are recomputed
   * on release and so cannot show what was originally assessed.
   */
  taxPosition: SettlementTaxPosition | null;
}

/** Read one settlement plus its tax trail, optionally enforcing partner ownership. */
@Injectable()
export class GetBookingSettlementUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(TAX_COMPLIANCE_REPOSITORY) private readonly tax: ITaxComplianceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    bookingId: string,
    partnerId?: string,
  ): Promise<BookingSettlementView | null> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const settlement = await this.settlements.findByBooking(tx, bookingId);
      if (!settlement || (partnerId && settlement.partnerId !== partnerId)) return null;
      return { settlement, taxPosition: await this.tax.taxPositionForSettlement(tx, settlement.id) };
    });
  }
}
